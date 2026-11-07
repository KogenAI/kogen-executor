package contract_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

// fakeClaude is a synthetic `claude` installed at claudecode.RuntimePath(home), so Start
// installs nothing (adapted from kogen-build's fakeClaudeScript). It is a POSIX sh script that
// answers --version and `auth status --json`, and for a round saves its stdin as
// <state>/prompt-<n>.bin and prints a system/init line followed by the round's lines
// (<state>/round-<n>.jsonl, in which @SID@ stands for the session id).
type fakeClaude struct {
	state string
}

type fakeOptions struct {
	// APIKeySource is the init event's apiKeySource (default "none").
	APIKeySource string
	// Checkout is the physical path reported as the init event's cwd.
	Checkout string
}

// newFake installs the fake under home; rounds[i] is round i+1's lines after the init line.
func newFake(t testing.TB, home string, rounds [][]string, opts ...fakeOptions) *fakeClaude {
	t.Helper()
	var o fakeOptions
	if len(opts) > 0 {
		o = opts[0]
	}
	if o.APIKeySource == "" {
		o.APIKeySource = "none"
	}
	f := &fakeClaude{state: t.TempDir()}
	for i, lines := range rounds {
		body := strings.Join(lines, "\n") + "\n"
		if err := os.WriteFile(filepath.Join(f.state, "round-"+strconv.Itoa(i+1)+".jsonl"), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	script := `#!/bin/sh
STATE=` + shQuote(f.state) + `
CWD=` + shQuote(o.Checkout) + `
KEYSRC=` + shQuote(o.APIKeySource) + `
if [ "$1" = "--version" ]; then
  echo "` + claudecode.Version + ` (Claude Code)"
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max"}'
  exit 0
fi
n=0
if [ -f "$STATE/calls" ]; then n=$(cat "$STATE/calls"); fi
n=$((n+1))
echo "$n" > "$STATE/calls"
cat > "$STATE/prompt-$n.bin"
sid=
prev=
for a in "$@"; do
  case "$prev" in
    --session-id|--resume) sid=$a ;;
  esac
  prev=$a
done
printf '{"type":"system","subtype":"init","cwd":"%s","session_id":"%s","mcp_servers":[],"permissionMode":"acceptEdits","apiKeySource":"%s","claude_code_version":"` + claudecode.Version + `","model":"claude-sonnet-5-5"}\n' "$CWD" "$sid" "$KEYSRC"
if [ -f "$STATE/round-$n.jsonl" ]; then sed "s/@SID@/$sid/g" "$STATE/round-$n.jsonl"; fi
exit 0
`
	path := claudecode.RuntimePath(home)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	// The runtime must have the pinned size of the platform, or the adapter refuses it; the
	// script exits before the sparse padding.
	if size := pinnedRuntimeSize(); size > 0 {
		if err := os.Truncate(path, size); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

// prompt is the bytes the fake read from stdin in round n.
func (f *fakeClaude) prompt(t testing.TB, n int) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(f.state, fmt.Sprintf("prompt-%d.bin", n)))
	if err != nil {
		t.Fatalf("the fake claude saved no prompt for round %d: %v", n, err)
	}
	return string(b)
}

func shQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }

// Stream lines of a synthetic round.

func toolUseLine(id, name string, input map[string]any) string {
	return mustJSON(nil, map[string]any{"type": "assistant", "message": map[string]any{"content": []any{
		map[string]any{"type": "tool_use", "id": id, "name": name, "input": input}}}})
}

func toolResultLine(id string) string {
	return mustJSON(nil, map[string]any{
		"type": "user", "message": map[string]any{"content": []any{
			map[string]any{"type": "tool_result", "tool_use_id": id, "content": "ok"}}},
		"tool_result_meta": []any{map[string]any{"id": id, "permission_decision": map[string]any{"decision": "allow"}}},
	})
}

func assistantErrorLine(code string) string {
	return mustJSON(nil, map[string]any{"type": "assistant", "error": code, "message": map[string]any{"content": []any{}}})
}

// resultLine is a success result of session @SID@, with extra merged over it.
func resultLine(extra map[string]any) string {
	m := map[string]any{
		"type": "result", "subtype": "success", "is_error": false, "result": "done", "session_id": "@SID@",
		"num_turns": 1, "terminal_reason": "completed",
	}
	for k, v := range extra {
		m[k] = v
	}
	return mustJSON(nil, m)
}

// session is a started adapter session on a fake, with its run-log events.
type fakeRun struct {
	fake     *fakeClaude
	session  executor.Session
	ex       executor.Executor
	events   *eventLog
	checkout string
}

type eventLog struct {
	mu   sync.Mutex
	list []map[string]any
}

func (l *eventLog) emit(ev map[string]any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.list = append(l.list, ev)
}

func (l *eventLog) named(name string) []map[string]any {
	l.mu.Lock()
	defer l.mu.Unlock()
	var out []map[string]any
	for _, ev := range l.list {
		if ev["event"] == name {
			out = append(out, ev)
		}
	}
	return out
}

// schemaObject is the schema of the structured submission every role's task hands the adapter.
const schemaObject = `{"type":"object"}`

// startFake installs a fake with the rounds, starts a session for the role on a fresh
// checkout and returns it. A Start error is returned to the caller.
func startFake(t *testing.T, role string, rounds [][]string, opts ...fakeOptions) (*fakeRun, error) {
	t.Helper()
	requireSupported(t)
	home := t.TempDir()
	checkout := conformance.NewCheckout(t)
	var o fakeOptions
	if len(opts) > 0 {
		o = opts[0]
	}
	o.Checkout = checkout
	r := &fakeRun{fake: newFake(t, home, rounds, o), events: &eventLog{}, checkout: checkout}
	r.ex = claudecode.New(claudecode.Options{Home: home, HookCommand: []string{"/bin/true"}})
	task := executor.Task{
		Role: role, Root: checkout, Protected: []string{conformance.ProtectedPath},
		Brief: executor.Brief{Stable: "STABLE authority\n", Dynamic: "dynamic evidence"},
		Model: "claude-sonnet-5-5", Home: home, Dir: filepath.Join(t.TempDir(), "executor"),
		RunID: "run-1", Schema: json.RawMessage(schemaObject),
	}
	s, err := r.ex.Start(t.Context(), task, r.events.emit)
	if err != nil {
		return r, err
	}
	r.session = s
	t.Cleanup(func() { s.Close() })
	return r, nil
}

func mustJSON(t testing.TB, v any) string {
	if t != nil {
		t.Helper()
	}
	b, err := json.Marshal(v)
	if err != nil {
		if t == nil {
			panic(err)
		}
		t.Fatal(err)
	}
	return string(b)
}

func writeJSON(t testing.TB, path string, v any) string {
	t.Helper()
	if err := os.WriteFile(path, []byte(mustJSON(t, v)), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// realDir is a fresh directory whose path has no symlink component.
func realDir(t testing.TB) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

// pinnedRuntimeSize is the size of the pinned Claude Code executable of this platform, which
// the adapter checks before it runs the runtime (the same numbers as its manifest pin).
func pinnedRuntimeSize() int64 {
	switch runtime.GOOS + "/" + runtime.GOARCH {
	case "darwin/arm64":
		return 319598464
	case "linux/amd64":
		return 337814032
	}
	return 0
}
