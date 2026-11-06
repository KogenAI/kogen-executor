package claudecode

import (
	"context"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestRoundModelProjection(t *testing.T) {
	secret := "SYNTHETIC-secret"
	// requested and observed differ in every case, and each want derives from its own input.
	cases := []struct{ requested, wantRequested, observed, wantObserved string }{
		{strings.Repeat("a", 255), strings.Repeat("a", 255), strings.Repeat("b", 255), strings.Repeat("b", 255)},
		{strings.Repeat("a", 256), strings.Repeat("a", 256), strings.Repeat("b", 256), strings.Repeat("b", 256)},
		{strings.Repeat("a", 257), strings.Repeat("a", 256) + "...", strings.Repeat("b", 257), strings.Repeat("b", 256) + "..."},
		{strings.Repeat("a", 255) + "éx", strings.Repeat("a", 255) + "...", strings.Repeat("b", 255) + "éx", strings.Repeat("b", 255) + "..."},
		{strings.Repeat("a", 250) + secret + "suffix", strings.Repeat("a", 250) + "[redac...", strings.Repeat("b", 250) + secret + "suffix", strings.Repeat("b", 250) + "[redac..."},
		{"alias-a", "alias-a", "full-id-a", "full-id-a"},
	}
	for _, tc := range cases {
		s := &session{a: &adapter{opts: Options{Token: secret}}, task: executor.Task{Model: tc.requested}}
		r := &roundRun{s: s, modelSeen: true, model: tc.observed}
		event := map[string]any{}
		r.addModels(event)
		if event["requested_model"] != tc.wantRequested {
			t.Errorf("requested_model input length %d: got %q want %q", len(tc.requested), event["requested_model"], tc.wantRequested)
		}
		if event["model"] != tc.wantObserved {
			t.Errorf("model input length %d: got %q want %q", len(tc.observed), event["model"], tc.wantObserved)
		}
	}
}

func TestRoundModelOmittedWhenUnobserved(t *testing.T) {
	for name, init := range map[string]map[string]any{
		"missing":    {"model": nil},
		"empty":      {"model": ""},
		"non-string": {"model": 7},
	} {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Init: init})
			h.task.Model = "alias-a"
			s := h.startOK()
			result, err := s.Round(context.Background(), executor.Input{})
			if err != nil || result.Ending != executor.EndFinish {
				t.Fatalf("round: %+v %v", result, err)
			}
			events := h.eventsNamed("executor_round_ended")
			if len(events) != 1 || events[0]["requested_model"] != "alias-a" {
				t.Fatalf("events: %+v", events)
			}
			if v, ok := events[0]["model"]; ok {
				t.Fatalf("model present: %q", v)
			}
		})
	}
}

func TestRoundModelsAlias(t *testing.T) {
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Init: map[string]any{"model": "full-id-a"}})
	h.task.Model = "alias-a"
	s := h.startOK()
	result, err := s.Round(context.Background(), executor.Input{})
	if err != nil || result.Ending != executor.EndFinish {
		t.Fatalf("round: %+v %v", result, err)
	}
	events := h.eventsNamed("executor_round_ended")
	if len(events) != 1 || events[0]["requested_model"] != "alias-a" || events[0]["model"] != "full-id-a" {
		t.Fatalf("events: %+v", events)
	}
}
