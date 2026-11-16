package claudecode

import (
	"context"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func signalEndDetail(t *testing.T, cfg fakeConfig) string {
	t.Helper()
	cfg.Script = oneRound(finishRound)
	h := newHarness(t, cfg)
	s := h.startOK()
	_, err := s.Round(context.Background(), executor.Input{})
	return wantError(t, err, "executor/failed").Detail
}

func TestRoundSignalBeforeInitIsNamed(t *testing.T) {
	got := signalEndDetail(t, fakeConfig{ExitBeforeStdin: true, Signal: 15, SignalAt: "before_stdin"})
	want := "Claude Code was ended by signal 15 (terminated) before starting; stderr: fake claude: dying before reading the prompt"
	if got != want {
		t.Fatalf("detail %q, want %q", got, want)
	}
}

func TestRoundSignalWithoutResultIsNamed(t *testing.T) {
	got := signalEndDetail(t, fakeConfig{Signal: 9, SignalAt: "after_init"})
	if want := "Claude Code was ended by signal 9 (killed) without a result"; got != want {
		t.Fatalf("detail %q, want %q", got, want)
	}
}

func TestRoundSignalAfterSuccessResultIsNamed(t *testing.T) {
	got := signalEndDetail(t, fakeConfig{Signal: 9, SignalAt: "after_result"})
	if want := "Claude Code was ended by signal 9 (killed) after a success result"; got != want {
		t.Fatalf("detail %q, want %q", got, want)
	}
}
