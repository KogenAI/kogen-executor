package clauderuntime_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
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

// runFake runs the installed fake as one round with a prompt on stdin and, when token is not
// nil, the token on a pipe passed as file descriptor 3, the way the adapter hands one over.
func runFake(t *testing.T, fx *clauderuntime.Fixture, token *string, args ...string) string {
	t.Helper()
	cmd := exec.Command(claudecode.RuntimePath(fx.Home), args...)
	cmd.Stdin = strings.NewReader("prompt")
	if token != nil {
		r, w, err := os.Pipe()
		if err != nil {
			t.Fatal(err)
		}
		defer r.Close()
		if _, err := w.WriteString(*token); err != nil {
			t.Fatal(err)
		}
		w.Close()
		cmd.ExtraFiles = []*os.File{r}
	}
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("the fake round with args %q failed: %v", args, err)
	}
	return string(out)
}

// A round run with arguments and a token on fd 3 returns both through Args and Token.
func TestFixtureRecordsArgsAndToken(t *testing.T) {
	fx := installFixture(t, clauderuntime.Options{Rounds: [][]string{{clauderuntime.ResultLine(nil)}, {clauderuntime.ResultLine(nil)}}})
	argv := []string{"-p", "--model", "claude-sonnet-5-5", "--json-schema", `{"a b": 1}`}
	tok1, tok2 := "sk-ant-oat01-SYNTHETIC", "sk-ant-oat01-WITH-NEWLINE\n"
	runFake(t, fx, &tok1, argv...)
	runFake(t, fx, &tok2, "-p", "--resume", "sid")
	if got := fx.Args(t, 1); !reflect.DeepEqual(got, argv) {
		t.Fatalf("Args(1) = %q, want %q", got, argv)
	}
	if got := fx.Args(t, 2); !reflect.DeepEqual(got, []string{"-p", "--resume", "sid"}) {
		t.Fatalf("Args(2) = %q", got)
	}
	if got := fx.Token(t, 1); got != tok1 {
		t.Fatalf("Token(1) = %q, want %q", got, tok1)
	}
	if got := fx.Token(t, 2); got != tok2 {
		t.Fatalf("Token(2) = %q, want the exact bytes %q", got, tok2)
	}
	if b, err := os.ReadFile(filepath.Join(fx.State, "args-1.txt")); err != nil || string(b) != strings.Join(argv, "\n")+"\n" {
		t.Fatalf("args-1.txt = %q, %v", b, err)
	}
}

// A round run without fd 3 still answers and records no token; Token fails the test, and so do
// Args and Token for a round that never ran.
func TestFixtureRoundWithoutFD3(t *testing.T) {
	fx := installFixture(t, clauderuntime.Options{Rounds: [][]string{{clauderuntime.ResultLine(map[string]any{"result": "no token"})}}})
	out := runFake(t, fx, nil, "-p", "--session-id", "sid")
	if !strings.Contains(out, `"subtype":"init"`) || !strings.Contains(out, `"result":"no token"`) {
		t.Fatalf("the round printed %q", out)
	}
	if _, err := os.Stat(filepath.Join(fx.State, "token-1.bin")); !os.IsNotExist(err) {
		t.Fatalf("token-1.bin exists (%v) for a round without fd 3", err)
	}
	if got := fx.Args(t, 1); !reflect.DeepEqual(got, []string{"-p", "--session-id", "sid"}) {
		t.Fatalf("Args(1) = %q", got)
	}
	for _, c := range []struct {
		name string
		call func(testing.TB)
		want string
	}{
		{"Token without fd 3", func(tb testing.TB) { fx.Token(tb, 1) }, "round 1"},
		{"Args of a round that never ran", func(tb testing.TB) { fx.Args(tb, 2) }, "round 2"},
		{"Token of a round that never ran", func(tb testing.TB) { fx.Token(tb, 2) }, "round 2"},
	} {
		ft := &failRecorder{TB: t}
		func() {
			defer func() { _ = recover() }()
			c.call(ft)
		}()
		if !ft.failed || !strings.Contains(ft.msg, c.want) {
			t.Fatalf("%s: failed=%v message %q, want a failure naming %q", c.name, ft.failed, ft.msg, c.want)
		}
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
	msg    string
}

func (f *failRecorder) Helper() {}
func (f *failRecorder) Fatalf(format string, a ...any) {
	f.failed, f.msg = true, fmt.Sprintf(format, a...)
	panic("fatal")
}
