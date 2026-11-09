package clauderuntime_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
	"github.com/KogenAI/kogen-executor/executor/conformance"
	"github.com/KogenAI/kogen-executor/testkit/clauderuntime"
)

func installFixture(t *testing.T, o clauderuntime.Options) *clauderuntime.Fixture {
	t.Helper()
	if _, ok := claudecode.Supported(); !ok {
		t.Skip("unsupported platform")
	}
	o.Home, o.State = t.TempDir(), t.TempDir()
	return clauderuntime.Install(t, o)
}

// The fixture is accepted by the production runtime path: Probe answers and the installed file
// has the pinned size.
func TestFixtureAnswersThroughProbe(t *testing.T) {
	fx := installFixture(t, clauderuntime.Options{})
	out, err := claudecode.Probe(context.Background(), fx.Home, "--version")
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != clauderuntime.VersionOutput() {
		t.Fatalf("--version answered %q, want %q", out, clauderuntime.VersionOutput())
	}
	out, err = claudecode.Probe(context.Background(), fx.Home, "auth", "status", "--json")
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(out)) != clauderuntime.AuthStatusJSON {
		t.Fatalf("auth status answered %q", out)
	}
	size, _ := claudecode.RuntimeSize()
	if info, err := os.Stat(claudecode.RuntimePath(fx.Home)); err != nil || info.Size() != size {
		t.Fatalf("installed runtime %v, %v; want size %d", info, err, size)
	}
}

// A real adapter session runs a configured round on the fixture and the fake saves the prompt.
func TestFixtureServesSessionRound(t *testing.T) {
	checkout, err := filepath.EvalSymlinks(conformance.NewCheckout(t))
	if err != nil {
		t.Fatal(err)
	}
	fx := installFixture(t, clauderuntime.Options{Checkout: checkout, Rounds: [][]string{
		{clauderuntime.ToolUseLine("toolu_1", "Read", map[string]any{"file_path": "README.md"}), clauderuntime.ToolResultLine("toolu_1"),
			clauderuntime.ResultLine(map[string]any{"result": "all done"})},
	}})
	task := executor.Task{
		Role: executor.RoleBuild, Root: checkout, Protected: []string{conformance.ProtectedPath},
		Brief: executor.Brief{Stable: "STABLE\n", Dynamic: "dynamic"},
		Model: "claude-sonnet-5-5", Home: fx.Home, Dir: filepath.Join(t.TempDir(), "executor"),
		RunID: "run-1", Schema: json.RawMessage(`{"type":"object"}`),
	}
	s, err := claudecode.New(claudecode.Options{Home: fx.Home, HookCommand: []string{"/bin/true"}}).Start(context.Background(), task, func(map[string]any) {})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	res, err := s.Round(context.Background(), executor.Input{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Claim != "all done" {
		t.Fatalf("claim %q", res.Claim)
	}
	if p := fx.Prompt(t, 1); !strings.HasSuffix(p, "dynamic") {
		t.Fatalf("round 1 prompt %q", p)
	}
}

func TestInstallRequiresHomeAndState(t *testing.T) {
	for _, o := range []clauderuntime.Options{{State: t.TempDir()}, {Home: t.TempDir()}} {
		ft := &failRecorder{TB: t}
		func() {
			defer func() { _ = recover() }()
			clauderuntime.Install(ft, o)
		}()
		if !ft.failed {
			t.Fatalf("Install(%+v) did not fail the test", o)
		}
	}
}

// failRecorder records Fatalf instead of ending the test, and stops Install like FailNow.
type failRecorder struct {
	testing.TB
	failed bool
}

func (f *failRecorder) Helper()               {}
func (f *failRecorder) Fatalf(string, ...any) { f.failed = true; panic("fatal") }
