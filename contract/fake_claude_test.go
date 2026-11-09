package contract_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
	"github.com/KogenAI/kogen-executor/executor/conformance"
	"github.com/KogenAI/kogen-executor/testkit/clauderuntime"
)

// fakeClaude is the shared fake `claude` of testkit/clauderuntime installed at
// claudecode.RuntimePath(home), so Start installs nothing.
type fakeClaude struct {
	*clauderuntime.Fixture
}

// fakeOptions are the contract suite's view of clauderuntime.Options.
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
	return &fakeClaude{clauderuntime.Install(t, clauderuntime.Options{
		Home: home, State: t.TempDir(), Rounds: rounds, APIKeySource: o.APIKeySource, Checkout: o.Checkout,
	})}
}

// prompt is the bytes the fake read from stdin in round n.
func (f *fakeClaude) prompt(t testing.TB, n int) string {
	t.Helper()
	return f.Prompt(t, n)
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
