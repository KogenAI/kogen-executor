package claudecode

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestProviderUnavailableResults(t *testing.T) {
	for _, tc := range []struct {
		name, assistant string
		result          map[string]any
		want            string
	}{
		{"assistant", "overloaded", nil, "executor/provider_unavailable"},
		{"529", "", map[string]any{"result": "API Error: 529 overloaded_error"}, "executor/provider_unavailable"},
		{"503", "", map[string]any{"result": "API Error: 503 Service Unavailable"}, "executor/provider_unavailable"},
		{"500", "", map[string]any{"result": "API Error: 500 Internal Server Error"}, "executor/provider_unavailable"},
		{"599", "", map[string]any{"result": "API Error: 599 Service Unavailable"}, "executor/provider_unavailable"},
		{"errors", "", map[string]any{"errors": []string{"overloaded_error: temporarily unavailable"}}, "executor/provider_unavailable"},
		{"499", "", map[string]any{"result": "API Error: 499"}, "executor/failed"},
		{"600", "", map[string]any{"result": "API Error: 600"}, "executor/failed"},
		{"embedded number", "", map[string]any{"result": "API Error: 5030"}, "executor/failed"},
		{"unrelated number", "", map[string]any{"result": "request 503 failed"}, "executor/failed"},
		{"usage precedence", "overloaded", map[string]any{"result": "quota exceeded"}, "executor/usage_limit"},
		{"context precedence", "overloaded", map[string]any{"result": "Prompt is too long"}, "candidate/context_budget_exceeded"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := map[string]any{"is_error": true, "terminal_reason": "api_error"}
			for k, v := range tc.result {
				result[k] = v
			}
			h := newHarness(t, fakeConfig{Script: oneRound(finishRound), AssistantError: tc.assistant, Result: result})
			s := h.startOK()
			_, err := s.Round(context.Background(), executor.Input{})
			wantError(t, err, tc.want)
		})
	}
}

func TestProviderUnavailableBoundedEvent(t *testing.T) {
	text := strings.Repeat("é", 600) + " API Error: 529 " + strings.Repeat("é", 1000)
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: map[string]any{"is_error": true, "terminal_reason": "api_error", "result": text}})
	s := h.startOK()
	_, err := s.Round(context.Background(), executor.Input{})
	e := wantError(t, err, "executor/provider_unavailable")
	if len(e.Detail) > 1024 || !utf8.ValidString(e.Detail) || !strings.Contains(e.Detail, "529") {
		t.Fatalf("bad detail (%d): %q", len(e.Detail), e.Detail)
	}
	events := h.eventsNamed("executor_round_failed")
	if len(events) != 1 || events[0]["reason"] != executor.ReasonProviderUnavailable || events[0]["detail"] != e.Detail {
		t.Fatalf("events: %#v", events)
	}
	_, err = s.Round(context.Background(), executor.Input{Feedback: "continue"})
	if e := wantError(t, err, "executor/failed"); e.Detail != "the executor session cannot continue after a failed round" {
		t.Fatal(e.Detail)
	}
	if s.Handle().Resume != executor.ResumeNone {
		t.Fatal(s.Handle().Resume)
	}
}

func TestProviderUnavailableLongStatusDiagnostic(t *testing.T) {
	text := "API Error:" + strings.Repeat(" ", 1500) + "529"
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: map[string]any{"is_error": true, "terminal_reason": "api_error", "result": text}})
	_, err := h.startOK().Round(context.Background(), executor.Input{})
	e := wantError(t, err, "executor/provider_unavailable")
	if !strings.Contains(e.Detail, "API Error:") || !strings.Contains(e.Detail, "529") || len(e.Detail) > 1024 {
		t.Fatalf("bad detail: %q", e.Detail)
	}
}
