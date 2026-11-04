package claudecode

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-loop/sys"
)

func TestRoundDeadlineSnapshot(t *testing.T) {
	for _, taskEarlier := range []bool{true, false} {
		name := "context_earlier"
		if taskEarlier {
			name = "task_earlier"
		}
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
			early := time.Now().Add(time.Hour)
			late := early.Add(time.Hour)
			parent := early
			h.task.Deadline = late
			if taskEarlier {
				parent = late
				h.task.Deadline = early
			}
			ctx, stop := context.WithDeadline(context.Background(), parent)
			defer stop()
			ctx, cancel := context.WithCancel(ctx)
			defer cancel()
			var lower, upper int64
			var terminal map[string]any
			s, err := New(h.f.options()).Start(context.Background(), h.task, func(e map[string]any) {
				switch e["event"] {
				case "executor_round_started":
					lower = time.Until(early).Milliseconds()
					for time.Until(early).Milliseconds() >= lower-10 {
						time.Sleep(15 * time.Millisecond)
					}
					cancel()
				case "executor_round_failed":
					terminal = e
				}
			})
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			upper = time.Until(early).Milliseconds()
			_, err = s.Round(ctx, executor.Input{})
			if err == nil {
				t.Fatal("expected cancellation")
			}
			got, ok := terminal["deadline_remaining_ms"].(int64)
			if !ok || got < lower || got > upper {
				t.Fatalf("snapshot %v outside [%d,%d]", terminal["deadline_remaining_ms"], lower, upper)
			}
		})
	}
}

func TestRoundWrappedSignalCause(t *testing.T) {
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
	ctx, cancel := context.WithCancelCause(context.Background())
	defer cancel(nil)
	signal := &sys.Interrupted{Signal: "SIGHUP"}
	wrapped := fmt.Errorf("wrapped: %w", signal)
	var terminal map[string]any
	s, err := New(h.f.options()).Start(context.Background(), h.task, func(e map[string]any) {
		if e["event"] == "executor_round_started" {
			cancel(wrapped)
		}
		if e["event"] == "executor_round_failed" {
			terminal = e
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	_, err = s.Round(ctx, executor.Input{})
	if err != wrapped || !errors.Is(err, signal) || signal.ExitCode() != 129 {
		t.Fatalf("signal error: %v", err)
	}
	if terminal["interrupt_cause"] != "signal" || terminal["signal"] != 1 {
		t.Fatalf("terminal: %v", terminal)
	}
}
