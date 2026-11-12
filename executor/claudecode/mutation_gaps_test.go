package claudecode

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

// spaces yields n space bytes, a valid JSON tail that costs no memory to describe.
type spaces int

func (s *spaces) Read(p []byte) (int, error) {
	if *s <= 0 {
		return 0, io.EOF
	}
	n := min(len(p), int(*s))
	for i := range p[:n] {
		p[i] = ' '
	}
	*s -= spaces(n)
	return n, nil
}

func TestHookInputSizeBoundary(t *testing.T) {
	h := newHookEnv(t)
	for _, c := range []struct {
		extra int
		code  int
	}{{0, 0}, {1, 2}} {
		tail := spaces(maxHookInput - 2 + c.extra)
		in := io.MultiReader(strings.NewReader("{}"), &tail)
		if code := RunHook([]string{"pretool", "--policy", h.policy}, in, io.Discard, io.Discard); code != c.code {
			t.Fatalf("%d bytes over the limit: code %d, want %d", c.extra, code, c.code)
		}
	}
}

func TestStderrPersistenceStopsAtCap(t *testing.T) {
	var out bytes.Buffer
	p := &stderrPersistence{w: &out, cap: 4}
	if n, err := p.Write([]byte("abcdef")); n != 6 || err != nil {
		t.Fatal(n, err)
	}
	if out.String() != "abcd" || p.kept != 4 || p.lost != 2 {
		t.Fatalf("%q kept=%d lost=%d", out.String(), p.kept, p.lost)
	}
}

func TestTerminateGroupSendsSIGTERMFirst(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "termed")
	cmd := exec.Command("sh", "-c", `trap 'echo x > "$1"; kill -9 $!; exit 0' TERM; echo ready; sleep 100 & wait`, "sh", marker)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	pgid := cmd.Process.Pid
	t.Cleanup(func() { syscall.Kill(-pgid, syscall.SIGKILL) })
	exited := make(chan struct{})
	go func() {
		cmd.Wait()
		close(exited)
	}()
	if l, _ := bufio.NewReader(out).ReadString('\n'); l != "ready\n" {
		t.Fatalf("child said %q", l)
	}
	terminateGroup(pgid, exited, 3*time.Second)
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("the child was not asked to stop with SIGTERM before SIGKILL: %v", err)
	}
}

func TestClosedSessionNeverStartsAChild(t *testing.T) {
	t.Parallel()
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
	s := h.startOK()
	s.Close()
	_, err := s.Round(context.Background(), executor.Input{})
	e := wantError(t, err, "executor/failed")
	if !strings.Contains(e.Detail, "closed") || len(h.eventsNamed("executor_round_started")) != 0 {
		t.Fatalf("round on a closed session: %q, events %v", e.Detail, h.events)
	}
}

func TestSessionClosedBeforeStartKillsTheChild(t *testing.T) {
	t.Parallel()
	h := newHarness(t, fakeConfig{Script: conformance.Script{Rounds: []conformance.RoundScript{finishRound}}})
	s := h.startOK().(*session)
	s.closed.Store(true) // Close landing after the round began but before the child was registered
	rr := &roundRun{s: s, n: 1, started: time.Now()}
	if _, err := s.runRound(context.Background(), 1, s.prompt(1, executor.Input{}), rr); err == nil {
		t.Fatal("a child started on a closed session ran to a result")
	}
}
