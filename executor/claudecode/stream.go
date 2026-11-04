package claudecode

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-loop/sys"
)

// guardedTools are the tools whose every call must have run the PreToolUse hook.
var guardedTools = map[string]bool{"Write": true, "Edit": true, "MultiEdit": true, "NotebookEdit": true}

// roundRun is the state of one round's event stream.
type roundRun struct {
	s                 *session
	n                 int
	deadlineRemaining any
	interrupted       bool

	init      bool
	model     string
	ccVersion string

	toolNames map[string]string // tool_use_id -> tool name
	guarded   map[string]string // tool_use_id -> tool name, guarded tools only
	targets   map[string]target // tool_use_id -> the guarded call's target as of its tool_use line
	arguments map[string]any    // tool_use_id -> the call's redacted, bounded input as of its tool_use line

	hookLog sentinelLog

	lines       int
	compactions int
	result      map[string]any // the result event, once seen

	authFailed     bool // an assistant event carried error authentication_failed
	overloaded     bool
	rateLimited    bool
	rateLimitCount int
	rateLimitInfo  map[string]any
	pending        map[string]bool

	// Round profile: observation only, reported in the terminal event.
	started     time.Time // the round's run state was created
	procStarted time.Time // the Claude Code process was started
	received    time.Time // receipt of the line being handled
	lastLine    time.Time // receipt of the previous line, zero before the first
	maxGap      time.Duration
	initAfter   time.Duration // process start to the accepted init line
	initSeen    bool
	ignored     map[string]int // ignored type/subtype key -> count
}

const (
	maxIgnoredKeys     = 16
	maxIgnoredKeyBytes = 64
)

// receive notes the receipt of one stdout line, before it is redacted or parsed.
func (r *roundRun) receive(now time.Time) {
	r.received = now
	if !r.lastLine.IsZero() {
		r.maxGap = max(r.maxGap, now.Sub(r.lastLine))
	}
	r.lastLine = now
}

// ignore counts a line the dispatch accepted without interpreting it.
func (r *roundRun) ignore(typ, sub string) {
	key := typ
	if sub != "" {
		key += "/" + sub
	}
	if len(key) > maxIgnoredKeyBytes {
		cut := maxIgnoredKeyBytes
		for cut > 0 && !isRuneStart(key[cut]) {
			cut--
		}
		key = key[:cut]
	}
	if _, ok := r.ignored[key]; !ok {
		if len(r.ignored) >= maxIgnoredKeys {
			return
		}
		if r.ignored == nil {
			r.ignored = map[string]int{}
		}
	}
	r.ignored[key]++
}

// addProfile adds the round's profile fields to a terminal event.
func (r *roundRun) addProfile(event map[string]any) {
	event["wall_ms"] = time.Since(r.started).Milliseconds()
	if r.initSeen {
		event["init_ms"] = r.initAfter.Milliseconds()
	}
	event["max_line_gap_ms"] = r.maxGap.Milliseconds()
	if len(r.ignored) != 0 {
		event["ignored_events"] = r.ignored
	}
}

// line handles one stream-json line: malformed JSON, a failed gate or a broken hook protocol
// is a typed error and the caller stops the process group.
func (r *roundRun) line(b []byte) error {
	return r.lineReceived(b, b)
}

func (r *roundRun) lineReceived(b, received []byte) error {
	r.lines++
	ev, err := decodeObject(b)
	if err != nil {
		return executor.Fail(executor.ReasonProtocol, "line "+strconv.Itoa(r.lines)+" of the event stream is not a JSON object")
	}
	if r.result != nil {
		return executor.Fail(executor.ReasonProtocol, "the event stream continued after its result")
	}
	typ, _ := ev["type"].(string)
	sub, _ := ev["subtype"].(string)
	if !r.init {
		switch {
		case typ == "system" && sub == "init":
		case typ == "system" && (sub == "hook_started" || sub == "hook_response" || sub == "plugin_install"):
			return nil // the documented startup events that may precede init
		default:
			return executor.Fail(executor.ReasonProtocol, "the first event was "+quoteBound(typ+"/"+sub)+", not system/init")
		}
	}
	switch typ {
	case "system":
		switch sub {
		case "init":
			return r.gate(ev)
		case "hook_started", "hook_response", "plugin_install":
		case "compact_boundary":
			metadata, _ := ev["compact_metadata"].(map[string]any)
			trigger, _ := metadata["trigger"].(string)
			if trigger != "" {
				var preTokens any
				if n := countPtr(metadata["pre_tokens"]); n != nil {
					preTokens = *n
				}
				r.compactions++
				r.s.emit(map[string]any{"event": "executor_context_compacted", "role": r.s.role, "round": r.n, "trigger": trigger, "pre_tokens": preTokens})
			}
		default:
			r.ignore(typ, sub)
		}
	case "assistant":
		if e, _ := ev["error"].(string); e == "authentication_failed" {
			r.authFailed = true
		}
		if e, _ := ev["error"].(string); e == "overloaded" {
			r.overloaded = true
		}
		if e, _ := ev["error"].(string); e == "rate_limit" {
			r.rateLimited = true
		}
		r.toolUses(ev)
	case "user":
		original, _ := decodeObject(received)
		return r.toolResults(ev, original)
	case "rate_limit_event":
		r.rateLimitCount++
		info, _ := ev["rate_limit_info"].(map[string]any)
		if status, ok := info["status"].(string); ok && status != "" {
			snapshot := map[string]any{"status": limitPrefix(status)}
			if typ, ok := info["rateLimitType"].(string); ok {
				snapshot["rateLimitType"] = limitPrefix(typ)
			}
			if reset, ok := info["resetsAt"].(json.Number); ok {
				snapshot["resetsAt"] = reset
			}
			r.rateLimitInfo = snapshot
		}
	case "result":
		r.result = ev
	default:
		r.ignore(typ, sub)
	}
	return nil
}

// limitPrefix bounds telemetry without adding a truncation marker.
func limitPrefix(s string) string {
	if len(s) <= 128 {
		return s
	}
	cut := 128
	for cut > 0 && !isRuneStart(s[cut]) {
		cut--
	}
	return s[:cut]
}

func (r *roundRun) addRateLimit(event map[string]any) {
	if r.rateLimitCount != 0 {
		event["rate_limit_event_count"] = r.rateLimitCount
	}
	if r.rateLimitInfo != nil {
		event["rate_limit_info"] = r.rateLimitInfo
	}
}

// gate is the per-round acceptance gate on the init event (audit section B).
func (r *roundRun) gate(ev map[string]any) error {
	if src, _ := ev["apiKeySource"].(string); src != "none" {
		return executor.Fail(executor.ReasonAuthRefused, "Claude Code reports its credential source as "+quoteBound(src)+", not the subscription sign-in (\"none\" API key); the round was stopped")
	}
	if sid, _ := ev["session_id"].(string); sid != r.s.sessionID {
		return executor.Fail(executor.ReasonProtocol, "Claude Code runs session "+quoteBound(sid)+", not the requested "+r.s.sessionID)
	}
	if mode, _ := ev["permissionMode"].(string); mode != "acceptEdits" {
		return executor.Fail(executor.ReasonProtocol, "Claude Code reports permission mode "+quoteBound(mode)+", not acceptEdits")
	}
	if servers, ok := ev["mcp_servers"].([]any); !ok || len(servers) != 0 {
		return executor.Fail(executor.ReasonProtocol, "Claude Code started with MCP servers or did not report them")
	}
	cwd, _ := ev["cwd"].(string)
	real, err := filepath.EvalSymlinks(cwd)
	if err != nil || cwd == "" || real != r.s.root {
		return executor.Fail(executor.ReasonProtocol, "Claude Code runs in "+quoteBound(cwd)+", not the checkout")
	}
	r.init = true
	if !r.procStarted.IsZero() {
		r.initSeen, r.initAfter = true, r.received.Sub(r.procStarted)
	}
	r.model, _ = ev["model"].(string)
	r.ccVersion, _ = ev["claude_code_version"].(string)
	if r.ccVersion == "" {
		r.ccVersion = r.s.version
	}
	return nil
}

func (r *roundRun) toolUses(ev map[string]any) {
	for _, c := range contentItems(ev) {
		if t, _ := c["type"].(string); t != "tool_use" {
			continue
		}
		id, _ := c["id"].(string)
		name, _ := c["name"].(string)
		if id == "" {
			continue
		}
		if r.toolNames == nil {
			r.toolNames, r.guarded, r.targets = map[string]string{}, map[string]string{}, map[string]target{}
		}
		r.toolNames[id] = name
		if r.arguments == nil {
			r.arguments = map[string]any{}
		}
		if _, seen := r.arguments[id]; !seen {
			r.arguments[id] = r.s.toolArguments(c["input"])
		}
		if r.pending == nil {
			r.pending = map[string]bool{}
		}
		r.pending[id] = true
		if guardedTools[name] {
			r.guarded[id] = name
			if _, seen := r.targets[id]; !seen {
				input, _ := c["input"].(map[string]any)
				r.targets[id] = observeTarget(r.s.root, input)
			}
		}
	}
}

// toolResults emits tool events and enforces hook liveness: a guarded tool call that completed
// (or was denied) must have a sentinel record from the hook, and a hook denial must have
// actually blocked the call.
func (r *roundRun) toolResults(ev, original map[string]any) error {
	metas := map[string]string{} // tool_use_id -> permission decision
	if list, ok := ev["tool_result_meta"].([]any); ok {
		for _, m := range list {
			mm, _ := m.(map[string]any)
			id, _ := mm["id"].(string)
			pd, _ := mm["permission_decision"].(map[string]any)
			metas[id], _ = pd["decision"].(string)
		}
	}
	originalItems := contentItems(original)
	for i, c := range contentItems(ev) {
		if t, _ := c["type"].(string); t != "tool_result" {
			continue
		}
		id, _ := c["tool_use_id"].(string)
		isErr, _ := c["is_error"].(bool)
		var result map[string]any
		if i < len(originalItems) {
			result = originalItems[i]
		}
		size, items := resultSize(result["content"])
		resultErr, _ := result["is_error"].(bool)
		delete(r.pending, id)
		name, known := r.toolNames[id]
		if !known {
			continue
		}
		denied := metas[id] == "reject"
		if _, ok := r.guarded[id]; ok {
			recs, err := r.hookLog.read(r.s.pol.Log, r.s.pol.Nonce)
			if err != nil {
				return executor.Fail(executor.ReasonProtocol, "cannot read the hook log: "+bound(err.Error(), 100))
			}
			rec, ok := recs[id]
			if !ok && r.s.role == "shape" {
				r.s.emit(map[string]any{"event": "executor_hook", "round": r.n, "tool_use_id": id, "tool_name": name, "decision": "deny", "hook": "configuration", "message": "write tools are not available during Shape"})
				r.s.emit(map[string]any{"event": "executor_tool", "round": r.n, "name": name, "tool_use_id": id, "denied": true, "arguments": r.arguments[id], "result_bytes": size, "result_error": resultErr, "result_items": items})
				continue
			}
			if !ok && isErr && r.targets[id].unchanged() {
				// Claude Code refused the call before the hook and nothing was written.
				r.s.emit(map[string]any{"event": "executor_tool", "round": r.n, "name": name, "tool_use_id": id, "denied": false, "rejected_before_hook": true, "arguments": r.arguments[id], "result_bytes": size, "result_error": resultErr, "result_items": items})
				continue
			}
			if !ok {
				return executor.Fail(executor.ReasonProtocol, "hook did not run for the "+name+" call "+quoteBound(id)+"; the round was stopped")
			}
			r.s.emit(map[string]any{"event": "executor_hook", "round": r.n, "tool_use_id": id, "tool_name": name, "decision": rec.Decision, "hook": "pretool"})
			if rec.Decision == "deny" {
				denied = true
				if !isErr {
					return executor.Fail(executor.ReasonProtocol, "the "+name+" call "+quoteBound(id)+" was denied by the hook but ran; the round was stopped")
				}
			}
		}
		r.s.emit(map[string]any{"event": "executor_tool", "round": r.n, "name": name, "tool_use_id": id, "denied": denied, "arguments": r.arguments[id], "result_bytes": size, "result_error": resultErr, "result_items": items})
	}
	return nil
}

// checkUnanswered validates guarded calls still pending at an accepted result.
func (r *roundRun) checkUnanswered() error {
	for id := range r.pending {
		name, guarded := r.guarded[id]
		if !guarded {
			continue
		}
		recs, err := r.hookLog.read(r.s.pol.Log, r.s.pol.Nonce)
		if err != nil {
			return executor.Fail(executor.ReasonProtocol, "cannot read the hook log: "+bound(err.Error(), 100))
		}
		rec, found := recs[id]
		if !found && !r.targets[id].unchanged() {
			return executor.Fail(executor.ReasonProtocol, "hook did not run for the "+name+" call "+quoteBound(id)+"; the round was stopped")
		}
		denied := found && rec.Decision == "deny"
		if found {
			r.s.emit(map[string]any{"event": "executor_hook", "round": r.n, "tool_use_id": id, "tool_name": name, "decision": rec.Decision, "hook": "pretool"})
		}
		if denied && !r.targets[id].unchanged() {
			return executor.Fail(executor.ReasonProtocol, "the "+name+" call "+quoteBound(id)+" was denied by the hook but ran; the round was stopped")
		}
		r.s.emit(map[string]any{"event": "executor_tool", "round": r.n, "name": name, "tool_use_id": id, "denied": denied, "arguments": r.arguments[id], "unanswered": true})
	}
	return nil
}

// resultSize counts decoded text bytes and content items without retaining the content.
func resultSize(content any) (int, int) {
	switch v := content.(type) {
	case string:
		return len(v), 1
	case []any:
		size := 0
		for _, item := range v {
			block, _ := item.(map[string]any)
			if typ, _ := block["type"].(string); typ == "text" {
				text, _ := block["text"].(string)
				size += len(text)
			}
		}
		return size, len(v)
	}
	return 0, 0
}

// target is the file-system state of a guarded call's target path: observable (absent, or a
// regular file at most 1 MiB with its mode, size, modification time and content digest) or not.
// Without hook evidence an oversized target cannot qualify as a rejected-before-hook
// unchanged target, even on error; it causes an executor/protocol stop.
type target struct {
	path       string // absolute; empty when the call named no path
	observable bool
	absent     bool
	mode       fs.FileMode
	size       int64
	mtime      time.Time
	sum        [sha256.Size]byte
}

// observeTarget records the state of the input's file_path, else notebook_path (the keys the
// hook reads); a relative path is resolved against the checkout root.
func observeTarget(root string, input map[string]any) target {
	for _, k := range []string{"file_path", "notebook_path"} {
		if p, ok := input[k].(string); ok && p != "" {
			if !filepath.IsAbs(p) {
				p = filepath.Join(root, p)
			}
			return observePath(p)
		}
	}
	return target{}
}

const maxTargetDigest = 1 << 20

func observePath(p string) target {
	t := target{path: p}
	fi, err := os.Stat(p) // follows symlinks, as a write does
	if errors.Is(err, fs.ErrNotExist) {
		t.observable, t.absent = true, true
		return t
	}
	if err != nil || !fi.Mode().IsRegular() || fi.Size() > maxTargetDigest {
		return target{path: p}
	}
	f, err := os.Open(p)
	if err != nil {
		return target{path: p}
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, maxTargetDigest))
	after, statErr := f.Stat()
	if err != nil || statErr != nil || n != fi.Size() || after.Size() != fi.Size() || after.Mode() != fi.Mode() || !after.ModTime().Equal(fi.ModTime()) {
		return target{path: p}
	}
	t.observable, t.mode, t.size, t.mtime = true, fi.Mode(), fi.Size(), fi.ModTime()
	copy(t.sum[:], h.Sum(nil))
	return t
}

// unchanged reports whether the recorded state was observable and a fresh observation of the
// same path is identical.
func (t target) unchanged() bool {
	if !t.observable {
		return false
	}
	now := observePath(t.path)
	if !now.observable || now.absent != t.absent {
		return false
	}
	return t.absent || (now.mode == t.mode && now.size == t.size && now.mtime.Equal(t.mtime) && now.sum == t.sum)
}

// finish turns the seen result event and the process exit into the round's claim or error.
// exit is the process exit code (-1: signalled); killed means the adapter ended the process.
func (r *roundRun) finish(exit int, killed bool, stderrPath string) (executor.RoundResult, error) {
	s := r.s
	if !r.init {
		if exit != 0 {
			return executor.RoundResult{}, executor.Fail(executor.ReasonFailed, "Claude Code exited with status "+strconv.Itoa(exit)+" before starting"+stderrTail(stderrPath, s.a.redact))
		}
		return executor.RoundResult{}, executor.Fail(executor.ReasonProtocol, "Claude Code ended without any event stream")
	}
	if r.result == nil {
		if exit != 0 {
			return executor.RoundResult{}, executor.Fail(executor.ReasonFailed, "Claude Code exited with status "+strconv.Itoa(exit)+" without a result"+stderrTail(stderrPath, s.a.redact))
		}
		return executor.RoundResult{}, executor.Fail(executor.ReasonProtocol, "the event stream ended without a result event")
	}
	res := r.result
	if sid, _ := res["session_id"].(string); sid != s.sessionID {
		return executor.RoundResult{}, executor.Fail(executor.ReasonProtocol, "the result belongs to session "+quoteBound(sid))
	}
	subtype, _ := res["subtype"].(string)
	isErr, ok := res["is_error"].(bool)
	if !ok {
		return executor.RoundResult{}, executor.Fail(executor.ReasonProtocol, "the result has no boolean is_error flag")
	}
	terminal, _ := res["terminal_reason"].(string)
	// `claude auth status` does not check a token against the server: an expired or revoked one
	// only shows up here, as an assistant authentication_failed error or a 401 error result.
	if s.a.opts.Token != "" && (r.authFailed || isErr && authFailedText(res["result"])) {
		return executor.RoundResult{}, executor.Fail(executor.ReasonAuthRefused, tokenRefusedHint)
	}

	var ending executor.Ending
	var claim string
	var structured json.RawMessage
	var blocker *executor.BlockerClaim
	turns := countOf(res["num_turns"])
	switch {
	case subtype == "error_max_turns":
		ending = executor.EndNoCall
		claim = "Claude Code stopped because it reached the turn limit of " + strconv.Itoa(s.a.opts.MaxTurns) + " turns for this round."
	case subtype == "success" && !isErr:
		if exit != 0 && !killed {
			return executor.RoundResult{}, executor.Fail(executor.ReasonFailed, "Claude Code exited with status "+strconv.Itoa(exit)+" after a success result"+stderrTail(stderrPath, s.a.redact))
		}
		ending = executor.EndFinish
		text, ok := res["result"].(string)
		if s.role == executor.RoleBuild {
			if !ok {
				return executor.RoundResult{}, executor.Fail(executor.ReasonProtocol, "the success result has no result text")
			}
			claim = boundBytes(text, claimBytes)
			// The Build's submission schema is its own (the task's); of its result the adapter
			// reads only the executor contract's blocker claim.
			if obj, isObj := res["structured_output"].(map[string]any); isObj {
				if raw, has := obj["blocker"]; has && raw != nil {
					ending = executor.EndBlocker
					blocker = decodeBlocker(raw)
				}
			}
		} else {
			// The submission is the final result's structured_output object, never the text.
			obj, isObj := res["structured_output"].(map[string]any)
			if !isObj || obj == nil {
				return executor.RoundResult{}, executor.Fail(executor.ReasonProtocol, "the final success result of the "+s.role+" role has no structured_output object")
			}
			raw, merr := json.Marshal(obj)
			if merr != nil {
				return executor.RoundResult{}, executor.Fail(executor.ReasonProtocol, "the structured_output of the "+s.role+" role is not encodable: "+bound(merr.Error(), 100))
			}
			structured = raw
			claim = boundBytes(text, claimBytes)
		}
	default:
		d := "Claude Code reported an error result: subtype " + quoteBound(subtype)
		if terminal != "" {
			d += ", terminal reason " + quoteBound(terminal)
		}
		if errs, ok := res["errors"].([]any); ok && len(errs) > 0 {
			if first, ok := errs[0].(string); ok {
				d += ": " + bound(first, 200)
			}
		}
		// Claude Code refuses a prompt over the model's context: a context result, not an
		// ordinary failure, and never retried or clipped.
		if isErr && !r.authFailed && !authFailedText(res["result"]) && (terminal == "blocking_limit" || promptTooLongText(res["result"])) {
			text, _ := res["result"].(string)
			return executor.RoundResult{}, sys.Fail("candidate", "context_budget_exceeded", "Claude Code refused the "+s.role+" prompt as too long for the model's context (terminal reason "+
				quoteBound(terminal)+": "+bound(text, 200)+"); the round's prompt was "+strconv.Itoa(s.promptLen)+" bytes; nothing was clipped or retried", 1)
		}
		reason := executor.ReasonFailed
		if isErr && !r.authFailed && !authFailedText(res["result"]) && ((subtype == "success" && terminal == "api_error" && r.rateLimited) || usageLimitText(res["result"]) || usageLimitText(res["errors"])) {
			if len(r.pending) != 0 {
				return executor.RoundResult{}, executor.Fail(executor.ReasonProtocol, "usage-limit result left tool calls unfinished; continuation is unsafe")
			}
			reason = executor.ReasonUsageLimit
		}
		if reason == executor.ReasonFailed && isErr && !r.authFailed && !authFailedText(res["result"]) {
			diagnostic := providerDiagnostic(res["result"])
			if diagnostic == "" {
				diagnostic = providerDiagnostic(res["errors"])
			}
			if diagnostic == "" && r.overloaded {
				diagnostic = "overloaded"
			}
			if diagnostic != "" {
				return executor.RoundResult{}, executor.Fail(executor.ReasonProviderUnavailable, "Claude Code provider unavailable: "+diagnostic)
			}
		}
		return executor.RoundResult{}, executor.Fail(reason, d)
	}

	if err := r.checkUnanswered(); err != nil {
		return executor.RoundResult{}, err
	}

	usage := s.mapUsage(res, r.model)
	denials := 0
	if d, ok := res["permission_denials"].([]any); ok {
		denials = len(d)
	}
	if r.model != "" {
		s.model = r.model
	}
	h := s.Handle()
	out := executor.RoundResult{Ending: ending, Claim: claim, Structured: structured, Blocker: blocker, Usage: usage, Handle: h}
	event := map[string]any{
		"event": "executor_round_ended", "role": s.role, "round": r.n, "ending": string(ending),
		"usage": usageEvent(usage), "num_turns": turns, "permission_denials": denials,
		"session_id": s.sessionID, "model": r.model, "claude_code_version": r.ccVersion,
		"terminal_reason": terminal, "deadline_remaining_ms": r.deadlineRemaining, "compactions": r.compactions,
	}
	r.addRateLimit(event)
	r.addProfile(event)
	s.emit(event)
	return out, nil
}

// mapUsage maps the result's per-invocation usage the way Kogen maps Anthropic usage
// (provider.anthropicUsage): Input = input_tokens + cache_read_input_tokens +
// cache_creation_input_tokens, only when all three are reported; Cached = cache reads;
// Output = output_tokens; Reasoning is not reported (nil). State is complete when Input,
// Cached and Output are all known, unknown when none is, otherwise partial (unknown fields stay
// nil, never zero). CostUSD is the delta of the cumulative total_cost_usd since the previous
// round of this session: Claude Code's API-equivalent estimate, not a bill.
func (s *session) mapUsage(res map[string]any, model string) executor.Usage {
	u, total, ok := s.usageOf(res, model)
	if ok {
		s.prevCost = total
	}
	return u
}

// usageOf is mapUsage without advancing the session's cost baseline: it also returns the
// result's cumulative total and whether that total became the CostUSD delta.
func (s *session) usageOf(res map[string]any, model string) (u executor.Usage, cumulative float64, advanced bool) {
	u = executor.Usage{State: executor.UsageUnknown, Source: executor.UsageHarness, Model: model}
	if usage, ok := res["usage"].(map[string]any); ok {
		in, cr, cw := countPtr(usage["input_tokens"]), countPtr(usage["cache_read_input_tokens"]), countPtr(usage["cache_creation_input_tokens"])
		u.Cached, u.Output = cr, countPtr(usage["output_tokens"])
		if in != nil && cr != nil && cw != nil {
			total := *in + *cr + *cw
			u.Input = &total
		}
	}
	switch {
	case u.Input != nil && u.Cached != nil && u.Output != nil:
		u.State = executor.UsageComplete
	case u.Input != nil || u.Cached != nil || u.Output != nil:
		u.State = executor.UsagePartial
	}
	if total, ok := number(res["total_cost_usd"]); ok && total >= s.prevCost {
		d := math.Round((total-s.prevCost)*1e9) / 1e9
		u.CostUSD = &d
		return u, total, true
	}
	return u, 0, false
}

// addResult adds what the round's result line reported to a failed round's event: usage (as on
// executor_round_ended), num_turns, subtype and terminal_reason. A round whose stream never
// reached a result line, and a field the result did not report, add nothing. The session's cost
// baseline is not advanced.
func (r *roundRun) addResult(event map[string]any) {
	res := r.result
	if res == nil {
		return
	}
	_, hasUsage := res["usage"].(map[string]any)
	_, hasCost := res["total_cost_usd"].(json.Number)
	if hasUsage || hasCost {
		u, _, _ := r.s.usageOf(res, r.model)
		event["usage"] = usageEvent(u)
	}
	if n := countPtr(res["num_turns"]); n != nil {
		event["num_turns"] = *n
	}
	for _, k := range []string{"subtype", "terminal_reason"} {
		if v, ok := res[k].(string); ok && v != "" {
			event[k] = v
		}
	}
}

func usageEvent(u executor.Usage) map[string]any {
	m := map[string]any{"state": u.State, "source": u.Source, "input": nil, "cached": nil, "output": nil, "reasoning": nil, "cost_usd": nil, "model": u.Model}
	for k, p := range map[string]*int{"input": u.Input, "cached": u.Cached, "output": u.Output, "reasoning": u.Reasoning} {
		if p != nil {
			m[k] = *p
		}
	}
	if u.CostUSD != nil {
		m["cost_usd"] = *u.CostUSD
	}
	return m
}

// decodeObject decodes one JSON object keeping numbers exact.
func decodeObject(b []byte) (map[string]any, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var m map[string]any
	if err := dec.Decode(&m); err != nil || m == nil {
		return nil, errNotObject
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errNotObject
	}
	return m, nil
}

type notObject struct{}

func (notObject) Error() string { return "not a JSON object" }

var errNotObject error = notObject{}

func contentItems(ev map[string]any) []map[string]any {
	msg, _ := ev["message"].(map[string]any)
	list, _ := msg["content"].([]any)
	var out []map[string]any
	for _, c := range list {
		if m, ok := c.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

// countPtr is a nonnegative integer count, nil when absent or not one.
func countPtr(v any) *int {
	n, ok := v.(json.Number)
	if !ok {
		return nil
	}
	i, err := strconv.ParseInt(string(n), 10, 64)
	if err != nil || i < 0 || i > math.MaxInt32*1000 {
		return nil
	}
	c := int(i)
	return &c
}

func countOf(v any) int {
	if p := countPtr(v); p != nil {
		return *p
	}
	return 0
}

func number(v any) (float64, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	f, err := n.Float64()
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) || f < 0 {
		return 0, false
	}
	return f, true
}

// boundBytes keeps at most n bytes of s on a rune boundary, marking a truncation within n.
func boundBytes(s string, n int) string {
	if len(s) <= n {
		return s
	}
	const mark = "\n[truncated]"
	cut := n - len(mark)
	for cut > 0 && !isRuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + mark
}

// stderrTail is a short bounded excerpt of the round's stderr for an error message.
func stderrTail(path string, redact func(string) string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || fi.Size() == 0 {
		return ""
	}
	const n = 400
	off := max(0, fi.Size()-n)
	buf := make([]byte, fi.Size()-off)
	k, _ := f.ReadAt(buf, off)
	s := strings.TrimSpace(redact(string(buf[:k])))
	if s == "" {
		return ""
	}
	return "; stderr: " + strings.ReplaceAll(bound(s, n), "\n", " | ")
}

// promptTooLongText reports whether a result text is Claude Code's refusal of an oversized prompt.
func promptTooLongText(v any) bool {
	t, _ := v.(string)
	return strings.Contains(t, "Prompt is too long")
}

// authFailedText reports whether a result text is Claude Code's 401 authentication failure.
func authFailedText(v any) bool {
	t, _ := v.(string)
	return strings.Contains(t, "Failed to authenticate") || strings.Contains(t, "API Error: 401")
}

// decodeBlocker types a Build blocker object. Anything but exactly the three typed fields
// (paths, reason, evidence) is an empty claim, which Kogen refuses.
func decodeBlocker(v any) *executor.BlockerClaim {
	raw, err := json.Marshal(v)
	if err != nil {
		return &executor.BlockerClaim{}
	}
	var keys map[string]json.RawMessage
	if json.Unmarshal(raw, &keys) != nil || len(keys) != 3 {
		return &executor.BlockerClaim{}
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var c executor.BlockerClaim
	if dec.Decode(&c) != nil {
		return &executor.BlockerClaim{}
	}
	for _, k := range []string{"paths", "reason", "evidence"} {
		if _, ok := keys[k]; !ok {
			return &executor.BlockerClaim{}
		}
	}
	return &c
}

// usageLimitText recognizes explicit diagnostics, not generic API failures or usage percentages.
func usageLimitText(v any) bool {
	switch x := v.(type) {
	case string:
		t := strings.ToLower(x)
		return strings.Contains(t, "rate limit") || strings.Contains(t, "rate_limit") || strings.Contains(t, "usage limit") || strings.Contains(t, "usage_limit") || strings.Contains(t, "quota exceeded")
	case []any:
		for _, item := range x {
			if usageLimitText(item) {
				return true
			}
		}
	}
	return false
}

// Match explicit overload wording or a status in an API error diagnostic, not incidental numbers.
var providerTrouble = regexp.MustCompile(`(?i)overloaded_error|\boverloaded\b|api error:\s*(?:http\s*)?5[0-9][0-9]\b`)

func providerDiagnostic(v any) string {
	switch x := v.(type) {
	case string:
		loc := providerTrouble.FindStringIndex(x)
		if loc == nil {
			return ""
		}
		// A status diagnostic can contain arbitrarily much whitespace between its
		// label and status. Keep both ends so truncation cannot discard the status.
		if loc[1]-loc[0] > 700 {
			return bound(x[loc[0]:loc[0]+100]+" ... "+x[loc[1]-100:loc[1]], 990)
		}
		start := max(0, loc[0]-200)
		for start < loc[0] && !isRuneStart(x[start]) {
			start++
		}
		return bound(boundBytes(x[start:], 990), 990)
	case []any:
		for _, item := range x {
			if d := providerDiagnostic(item); d != "" {
				return d
			}
		}
	}
	return ""
}
