package claudecode

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

// detachedAlive reports whether pid is a live process; a zombie awaiting its reaper counts as gone.
func detachedAlive(pid int) bool {
	if syscall.Kill(pid, 0) != nil {
		return false
	}
	out, _ := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(pid)).Output()
	stat := strings.TrimSpace(string(out))
	return stat != "" && !strings.HasPrefix(stat, "Z")
}

func detachedWaitGone(pid int, within time.Duration) bool {
	end := time.Now().Add(within)
	for time.Now().Before(end) {
		if !detachedAlive(pid) {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return !detachedAlive(pid)
}

func detachedPid(t *testing.T, root string) int {
	t.Helper()
	file := filepath.Join(root, ".detached-child.pid")
	for i := 0; i < 100; i++ {
		if b, err := os.ReadFile(file); err == nil {
			if pid, err := strconv.Atoi(strings.TrimSpace(string(b))); err == nil {
				return pid
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("the fake did not record a detached child pid in %s", file)
	return 0
}

var sleepingRound = conformance.RoundScript{End: "finish", Claim: "done", Actions: []conformance.Action{{SleepSeconds: 30}}}

func TestCancelledRoundStopsDetachedDescendant(t *testing.T) {
	h := newHarness(t, fakeConfig{DetachedChild: true, Script: oneRound(sleepingRound)})
	s := h.startOK()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		file := filepath.Join(h.root, ".detached-child.pid")
		for i := 0; i < 200; i++ {
			if _, err := os.Stat(file); err == nil {
				break
			}
			time.Sleep(50 * time.Millisecond)
		}
		cancel()
	}()
	if _, err := s.Round(ctx, executor.Input{}); err == nil {
		t.Fatal("the cancelled round returned no error")
	}
	pid := detachedPid(t, h.root)
	defer syscall.Kill(pid, syscall.SIGKILL)
	if !detachedWaitGone(pid, 5*time.Second) {
		t.Fatalf("detached descendant %d is still alive 5 s after the cancelled round returned", pid)
	}
}

func TestFailedRoundStopsDetachedDescendant(t *testing.T) {
	// The fake starts the detached child and exits with status 3 before any result.
	h := newHarness(t, fakeConfig{DetachedChild: true, NoResult: true, ExitCode: 3, Script: oneRound(finishRound)})
	s := h.startOK()
	_, err := s.Round(context.Background(), executor.Input{})
	wantError(t, err, "executor/failed")
	pid := detachedPid(t, h.root)
	defer syscall.Kill(pid, syscall.SIGKILL)
	if !detachedWaitGone(pid, 5*time.Second) {
		t.Fatalf("detached descendant %d is still alive 5 s after the failed round returned", pid)
	}
}

func TestDescendantStopSkipsUnrelatedProcess(t *testing.T) {
	un := exec.Command("sleep", "300")
	un.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := un.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { un.Process.Kill(); un.Wait() }()
	h := newHarness(t, fakeConfig{DetachedChild: true, Script: oneRound(finishRound)})
	s := h.startOK()
	if _, err := s.Round(context.Background(), executor.Input{}); err != nil {
		t.Fatalf("round: %v", err)
	}
	pid := detachedPid(t, h.root)
	defer syscall.Kill(pid, syscall.SIGKILL)
	if !detachedWaitGone(pid, 5*time.Second) {
		t.Fatalf("detached descendant %d of the round is still alive", pid)
	}
	if !detachedAlive(un.Process.Pid) {
		t.Fatalf("unrelated process %d was signalled although it is not a descendant of the round", un.Process.Pid)
	}
}

func TestDescendantListingFailureKeepsGroupKill(t *testing.T) {
	prev := processTable
	processTable = func() (string, error) { return "", errors.New("ps unavailable") }
	defer func() { processTable = prev }()

	h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
	s := h.startOK()
	res, err := s.Round(context.Background(), executor.Input{})
	if err != nil {
		t.Fatalf("a round that ends normally failed because the listing failed: %v", err)
	}
	if res.Claim != "done" {
		t.Fatalf("claim %q, want %q", res.Claim, "done")
	}

	h2 := newHarness(t, fakeConfig{Script: oneRound(sleepingRound)})
	s2 := h2.startOK()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	start := time.Now()
	if _, err = s2.Round(ctx, executor.Input{}); err == nil {
		t.Fatal("the cancelled round returned no error")
	}
	if took := time.Since(start); took > 12*time.Second {
		t.Fatalf("the cancelled round took %v with the listing unavailable; the group kill must end it within its bound", took)
	}
}
