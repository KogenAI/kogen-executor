package claudecode

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

// streamLines reads a round's raw stream and returns each line decoded in order.
func streamLines(t *testing.T, h *harness, round string) []map[string]any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(h.task.Dir, "round-"+round+".jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	var lines []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		var ev map[string]any
		if json.Unmarshal([]byte(l), &ev) == nil {
			lines = append(lines, ev)
		}
	}
	return lines
}

// toolResult is the tool_result of tool_use id in a stream line, if it carries one.
func toolResult(ev map[string]any, id string) (content string, isErr, ok bool) {
	msg, _ := ev["message"].(map[string]any)
	blocks, _ := msg["content"].([]any)
	for _, b := range blocks {
		m, _ := b.(map[string]any)
		if m["type"] == "tool_result" && m["tool_use_id"] == id {
			c, _ := m["content"].(string)
			e, _ := m["is_error"].(bool)
			return c, e, true
		}
	}
	return "", false, false
}

func TestBuildWakeupDeniedEveryRound(t *testing.T) {
	t.Parallel()
	attempt := finishRound
	attempt.Actions = []conformance.Action{{Shell: "printf 'full mix test output\\n' > mu-full.log"}}
	h := newHarness(t, fakeConfig{WakeupAttempt: true, Script: conformance.Script{Rounds: []conformance.RoundScript{attempt, attempt}}})
	s := h.startOK()
	inputs := []executor.Input{{}, {Feedback: "FIX THE TESTS"}}
	for i, in := range inputs {
		n := i + 1
		if _, err := s.Round(context.Background(), in); err != nil {
			t.Fatalf("round %d: %v", n, err)
		}
		argv := h.f.argv(n)
		var denied []string
		for j, a := range argv {
			if a == "--disallowedTools" && j+1 < len(argv) {
				denied = append(denied, strings.FieldsFunc(argv[j+1], func(r rune) bool { return r == ',' || r == ' ' })...)
			}
		}
		if !slices.Equal(denied, []string{"ScheduleWakeup"}) {
			t.Fatalf("round %d denies %q in %q", n, denied, argv)
		}
		// Every other argument survives, in the documented order, around the denial.
		var rest []string
		for j := 0; j < len(argv); j++ {
			if argv[j] == "--disallowedTools" {
				j++
				continue
			}
			rest = append(rest, argv[j])
		}
		for _, want := range []string{"--allowedTools", "Bash", "--permission-mode", "acceptEdits", "--output-format", "stream-json", "--json-schema", buildSchema, "--max-turns", "150", "--no-chrome", "--strict-mcp-config"} {
			if !slices.Contains(rest, want) {
				t.Fatalf("round %d lost %q: %q", n, want, argv)
			}
		}
		if got, want := slices.Contains(rest, "--resume"), n == 2; got != want {
			t.Fatalf("round %d resume=%v", n, got)
		}
		if got, want := slices.Contains(rest, "--append-system-prompt"), n == 1; got != want {
			t.Fatalf("round %d append-system-prompt=%v", n, got)
		}
		// The attempt was made, refused, and nothing continued after the result.
		var attempted, refused bool
		for _, ev := range streamLines(t, h, string(rune('0'+n))) {
			msg, _ := ev["message"].(map[string]any)
			blocks, _ := msg["content"].([]any)
			for _, b := range blocks {
				if m, _ := b.(map[string]any); m["type"] == "tool_use" && m["name"] == "ScheduleWakeup" {
					attempted = true
				}
			}
			if c, isErr, ok := toolResult(ev, "toolu_wakeup"); ok {
				refused = isErr && strings.Contains(c, "unavailable")
			}
		}
		if !attempted || !refused {
			t.Fatalf("round %d attempted=%v refused=%v", n, attempted, refused)
		}
	}
	// Shape retains its read-only denials alongside the wakeup denial.
	sh := roleHarness(t, executor.RoleShape, fakeConfig{Script: oneRound(structuredRound(`{"files":[]}`))})
	ss := sh.startOK()
	if _, err := ss.Round(context.Background(), executor.Input{}); err != nil {
		t.Fatal(err)
	}
	if got := argAfter(sh.f.argv(1), "--disallowedTools"); got != "Edit,Write,MultiEdit,NotebookEdit,ScheduleWakeup" {
		t.Fatalf("shape denies %q", got)
	}
}

func TestNonbuildWakeupDeniedEveryRound(t *testing.T) {
	t.Parallel()
	const sentence = "Scheduled wakeups are unavailable; await commands and their completion within the current round."
	for _, tc := range []struct{ role, denied string }{
		{executor.RoleShape, "Edit,Write,MultiEdit,NotebookEdit,ScheduleWakeup"},
		{executor.RoleReview, "ScheduleWakeup"},
	} {
		t.Run(tc.role, func(t *testing.T) {
			r := structuredRound(`{"verdict":"approve"}`)
			h := roleHarness(t, tc.role, fakeConfig{WakeupAttempt: true, Script: conformance.Script{Rounds: []conformance.RoundScript{r, r}}})
			s := h.startOK()
			defer s.Close()
			for i, in := range []executor.Input{{}, {Feedback: "continue"}} {
				n := i + 1
				res, err := s.Round(context.Background(), in)
				if err != nil || res.Ending != executor.EndFinish {
					t.Fatalf("round %d: result %+v error %v", n, res, err)
				}
				argv := h.f.argv(n)
				if got := argAfter(argv, "--disallowedTools"); got != tc.denied {
					t.Fatalf("round %d denied %q", n, got)
				}
				if n == 1 {
					frame := constraintsFor(tc.role)
					if !strings.Contains(frame, sentence) || argAfter(argv, "--append-system-prompt") != frame || !strings.HasPrefix(string(h.f.prompt(1)), frame+"\n\n") {
						t.Fatal("wakeup framing not delivered")
					}
				}
				events := streamLines(t, h, string(rune('0'+n)))
				attempted, refused, results := false, false, 0
				for j, ev := range events {
					msg, _ := ev["message"].(map[string]any)
					blocks, _ := msg["content"].([]any)
					for _, b := range blocks {
						m, _ := b.(map[string]any)
						if m["type"] == "tool_use" && m["name"] == "ScheduleWakeup" {
							attempted = true
						}
					}
					if c, isErr, ok := toolResult(ev, "toolu_wakeup"); ok {
						refused = attempted && isErr && strings.Contains(c, "unavailable")
					}
					if ev["type"] == "result" {
						results++
						if !refused || j != len(events)-1 {
							t.Fatalf("round %d result before refusal or followed by events: %v", n, events)
						}
					}
				}
				if !attempted || !refused || results != 1 {
					t.Fatalf("round %d attempted=%v refused=%v results=%d", n, attempted, refused, results)
				}
			}
		})
	}
}

func TestBuildLongCommandWithinRound(t *testing.T) {
	t.Parallel()
	r := finishRound
	// A finite local stand-in for a long command: the shell waits for its own child, prints, then
	// exits with a nonzero status.
	r.Actions = []conformance.Action{{Shell: "sleep 0.3 & wait $!; printf 'long-output\\n'; echo completion-marker; exit 7"}}
	h := newHarness(t, fakeConfig{Script: oneRound(r)})
	s := h.startOK()
	res, err := s.Round(context.Background(), executor.Input{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Ending != executor.EndFinish {
		t.Fatalf("ending %q", res.Ending)
	}
	if got := argAfter(h.f.argv(1), "--allowedTools"); got != "Bash" {
		t.Fatalf("Bash is not allowed: %q", got)
	}
	if strings.Contains(argAfter(h.f.argv(1), "--disallowedTools"), "Bash") {
		t.Fatal("Bash is disabled")
	}
	resultAt, resultsSeen := -1, 0
	var content string
	var failed bool
	for i, ev := range streamLines(t, h, "1") {
		if c, isErr, ok := toolResult(ev, "toolu_1_0"); ok {
			content, failed = c, isErr
			if resultAt >= 0 {
				t.Fatal("the command result came after the round result")
			}
		}
		if ev["type"] == "result" {
			resultAt = i
			resultsSeen++
		}
	}
	if resultsSeen != 1 {
		t.Fatalf("%d results", resultsSeen)
	}
	for _, want := range []string{"Exit code 7", "long-output", "completion-marker"} {
		if !strings.Contains(content, want) {
			t.Fatalf("command result lacks %q: %q", want, content)
		}
	}
	if !failed {
		t.Fatal("the nonzero exit status is not reported as an error")
	}
}

func TestBuildTrailingEventStillProtocol(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"malformed", "duplicate", "assistant"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			// A wakeup attempt that is denied, then an unrelated violation after the result.
			h := newHarness(t, fakeConfig{WakeupAttempt: true, TrailingKind: kind, Script: oneRound(finishRound)})
			s := h.startOK()
			_, err := s.Round(context.Background(), executor.Input{})
			wantError(t, err, "executor/protocol")
		})
	}
}
