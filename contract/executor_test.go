package contract_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
)

const allThree = "kogen, kogen-shaping, kogen-build"

func TestExecutorConstants(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, got, want string }{
		{"Contract", executor.Contract, "kogen.executor/v2"},
		{"Native", executor.Native, "native"},
		{"ClaudeCode", executor.ClaudeCode, "claude-code"},
		{"RoleShape", executor.RoleShape, "shape"},
		{"RoleBuild", executor.RoleBuild, "build"},
		{"RoleReview", executor.RoleReview, "review"},
		{"ResumeExact", executor.ResumeExact, "exact"},
		{"ResumeNone", executor.ResumeNone, "none"},
		{"UsageProvider", executor.UsageProvider, "provider"},
		{"UsageHarness", executor.UsageHarness, "harness"},
		{"UsageComplete", executor.UsageComplete, "complete"},
		{"UsagePartial", executor.UsagePartial, "partial"},
		{"UsageUnknown", executor.UsageUnknown, "unknown"},
		{"PreventWriteTool", executor.PreventWriteTool, "write_tool_refusal"},
		{"PreventPreToolWrite", executor.PreventPreToolWrite, "pretool_hook_write_edit"},
		{"EndFinish", string(executor.EndFinish), "finish"},
		{"EndNoCall", string(executor.EndNoCall), "no_call"},
		{"EndBlocker", string(executor.EndBlocker), "blocker"},
		{"ReasonUnavailable", executor.ReasonUnavailable, "unavailable"},
		{"ReasonAuthRefused", executor.ReasonAuthRefused, "auth_refused"},
		{"ReasonFailed", executor.ReasonFailed, "failed"},
		{"ReasonUsageLimit", executor.ReasonUsageLimit, "usage_limit"},
		{"ReasonProtocol", executor.ReasonProtocol, "protocol"},
		{"ReasonDeadline", executor.ReasonDeadline, "deadline"},
		{"ReasonInterrupted", executor.ReasonInterrupted, "interrupted"},
	} {
		eq(t, "executor."+c.name+" value ("+allThree+")", c.got, c.want)
	}
	for _, role := range []string{"shape", "build", "review"} {
		if !executor.IsRole(role) {
			t.Errorf("executor.IsRole(%q) is false (%s)", role, allThree)
		}
	}
	if executor.IsRole("refine") {
		t.Errorf("executor.IsRole(refine) is true: Shape includes Refine (%s)", allThree)
	}
}

func TestFail(t *testing.T) {
	t.Parallel()
	for _, reason := range []string{
		executor.ReasonUnavailable, executor.ReasonAuthRefused, executor.ReasonFailed, executor.ReasonUsageLimit,
		executor.ReasonProtocol, executor.ReasonDeadline, executor.ReasonInterrupted,
	} {
		item := "executor.Fail class executor/" + reason + " (kogen-build builder.go executor_external.go lineup_test.go; kogen cli/executor_wiring_test.go)"
		e := wantError(t, item, executor.Fail(reason, "the detail"), "executor", reason)
		if e == nil {
			continue
		}
		eq(t, item+" detail", e.Detail, "the detail")
		eq(t, item+" exit", e.Exit, 1)
	}
}

func TestRoundLimit(t *testing.T) {
	t.Parallel()
	item := "executor.RoundLimit candidate/executor_round_limit (kogen-build executor_test.go k19_no_progress_test.go)"
	e := wantError(t, item, executor.RoundLimit(6), "candidate", "executor_round_limit")
	if e == nil {
		return
	}
	if !strings.Contains(e.Detail, "6 rounds") {
		t.Errorf("%s: detail %q does not name 6 rounds", item, e.Detail)
	}
	eq(t, item+" exit", e.Exit, 1)
	if d := executor.RoundLimit(12).Detail; !strings.Contains(d, "12 rounds") {
		t.Errorf("%s: detail %q does not name 12 rounds", item, d)
	}
}

func TestDescriptorFor(t *testing.T) {
	t.Parallel()
	const item = "executor.Descriptor.For"
	shape := executor.RoleCapabilities{
		Resume: executor.ResumeNone, Continuation: true, Usage: executor.UsageHarness,
		Prevention: []string{executor.PreventPreToolWrite}, Structured: true, MaxRounds: 6,
		Limitations: []string{"no Shape workers"},
	}
	d := executor.Descriptor{
		Name: "x", Contract: executor.Contract, Version: "1",
		RoleCapabilities: map[string]executor.RoleCapabilities{executor.RoleShape: shape},
	}
	got, ok := d.For(executor.RoleShape)
	if !ok {
		t.Errorf("%s: a role listed in RoleCapabilities is not served (%s)", item, allThree)
	}
	deepEq(t, item+" returns RoleCapabilities entries as they are ("+allThree+")", got, shape)
	if _, ok := d.For(executor.RoleReview); ok {
		t.Errorf("%s: a role absent from RoleCapabilities and not Build is served (%s)", item, allThree)
	}

	// kogen-build's native descriptor: no RoleCapabilities, Build in the aggregate Roles.
	native := executor.Descriptor{
		Name: executor.Native, Contract: executor.Contract, Version: "v",
		Capabilities: executor.Capabilities{
			Roles: []string{executor.RoleBuild}, Resume: executor.ResumeExact, Continuation: true,
			Usage: executor.UsageProvider, Prevention: []string{executor.PreventWriteTool},
			Blocker: true, Images: true, MaxRounds: 12,
		},
	}
	fallback := item + " Build fallback of an aggregate-only descriptor (kogen-build native descriptor)"
	got, ok = native.For(executor.RoleBuild)
	if !ok {
		t.Fatalf("%s: Build is not served", fallback)
	}
	deepEq(t, fallback+" copies the aggregate capabilities including MaxRounds", got, executor.RoleCapabilities{
		Resume: executor.ResumeExact, Continuation: true, Usage: executor.UsageProvider,
		Prevention: []string{executor.PreventWriteTool}, Blocker: true, Images: true, MaxRounds: 12,
	})
	for _, role := range []string{executor.RoleShape, executor.RoleReview} {
		if _, ok := native.For(role); ok {
			t.Errorf("%s: serves the %s role", fallback, role)
		}
	}
	noBuild := executor.Descriptor{Capabilities: executor.Capabilities{Roles: []string{executor.RoleReview}}}
	if _, ok := noBuild.For(executor.RoleBuild); ok {
		t.Errorf("%s: serves Build though the aggregate Roles omit it", fallback)
	}
}

func TestValidateRole(t *testing.T) {
	t.Parallel()
	const item = "executor.Descriptor.ValidateRole executor/unavailable (kogen-build lineup_test.go; kogen cli/executor_wiring_test.go)"
	native := executor.Descriptor{
		Name: executor.Native, Contract: executor.Contract,
		Capabilities: executor.Capabilities{Roles: []string{executor.RoleBuild}},
	}
	if err := native.ValidateRole(executor.RoleBuild); err != nil {
		t.Errorf("%s: a served role is refused: %v", item, err)
	}
	if err := native.Validate(); err != nil {
		t.Errorf("%s: Validate (the Build role) refuses a Build descriptor: %v", item, err)
	}
	wantError(t, item+" unserved role", native.ValidateRole(executor.RoleShape), "executor", executor.ReasonUnavailable)
	other := native
	other.Contract = "kogen.executor/v1"
	wantError(t, item+" another contract id", other.ValidateRole(executor.RoleBuild), "executor", executor.ReasonUnavailable)
}

// fakeExecutor is a consumer-style executor (kogen-build executor_test.go): it satisfies
// Executor and, through its session, Session.
type fakeExecutor struct{}

func (fakeExecutor) Describe() executor.Descriptor { return executor.Descriptor{} }
func (fakeExecutor) Start(ctx context.Context, t executor.Task, emit executor.Sink) (executor.Session, error) {
	emit(map[string]any{"event": "executor_started"})
	return fakeSession{}, nil
}

type fakeSession struct{}

func (fakeSession) Round(ctx context.Context, in executor.Input) (executor.RoundResult, error) {
	return executor.RoundResult{}, nil
}
func (fakeSession) Handle() executor.Handle { return executor.Handle{} }
func (fakeSession) Close() error            { return nil }

func (fakeExecutor) FirstPromptBytes(role string, brief executor.Brief) int {
	return len(brief.Stable) + len(brief.Dynamic)
}

var (
	_ executor.Executor    = fakeExecutor{}
	_ executor.Session     = fakeSession{}
	_ executor.PromptSizer = fakeExecutor{}
	_ executor.Sink        = func(map[string]any) {}
)

// TestTypesConsumersConstruct pins the type and field names the consumers construct and read:
// the keyed literals below stop compiling when one is renamed or removed.
func TestTypesConsumersConstruct(t *testing.T) {
	t.Parallel()
	one, f := 1, 0.5
	task := executor.Task{
		Role: executor.RoleBuild, Root: "r", Brief: executor.Brief{Stable: "s", Dynamic: "d"},
		Protected: []string{"p"}, Excluded: []string{"e"}, Model: "m", Effort: "high", Approval: "a",
		StartTree: "t", RunID: "id", Deadline: time.Time{}, MaxRounds: 6, Schema: json.RawMessage(`{}`),
		Home: "h", Dir: "d",
	}
	usage := executor.Usage{Input: &one, Cached: &one, Output: &one, Reasoning: &one,
		State: executor.UsageComplete, Source: executor.UsageHarness, CostUSD: &f, Model: "m"}
	handle := executor.Handle{Role: "build", Executor: "x", Version: "v", SessionID: "s", Resume: executor.ResumeNone}
	res := executor.RoundResult{
		Ending: executor.EndBlocker, Claim: "c", Structured: json.RawMessage(`{}`),
		Blocker: &executor.BlockerClaim{Paths: []string{"p"}, Reason: "r", Evidence: "e"},
		Usage:   usage, Handle: handle,
	}
	caps := executor.Capabilities{Roles: []string{"build"}, Resume: "none", Continuation: true, Usage: "harness",
		Prevention: []string{"x"}, Blocker: true, Images: true, MaxRounds: 6}
	rc := executor.RoleCapabilities{Resume: "none", Continuation: true, Usage: "harness", Prevention: []string{"x"},
		Blocker: true, Images: true, Probe: true, Workers: true, Structured: true, MaxRounds: 6, Limitations: []string{"l"}}
	desc := executor.Descriptor{Name: "n", Contract: "c", Version: "v", Capabilities: caps,
		RoleCapabilities: map[string]executor.RoleCapabilities{"build": rc}}
	in := executor.Input{Feedback: "f"}
	// Read every field back, as the consumers read them.
	eq(t, "executor.Task fields ("+allThree+")", task.Brief.Stable+task.Brief.Dynamic+task.Root+task.Dir+task.Home, "sdrdh")
	eq(t, "executor.RoundResult fields ("+allThree+")", res.Blocker.Reason+res.Claim+string(res.Ending), "rcblocker")
	eq(t, "executor.Usage fields ("+allThree+")", *usage.Input+*usage.Cached+*usage.Output+*usage.Reasoning, 4)
	eq(t, "executor.Descriptor fields ("+allThree+")", desc.RoleCapabilities["build"].MaxRounds+desc.Capabilities.MaxRounds, 12)
	eq(t, "executor.Input and Handle fields ("+allThree+")", in.Feedback+handle.SessionID, "fs")
}
