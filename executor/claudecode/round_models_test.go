package claudecode

import (
	"context"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestRoundModelProjection(t *testing.T) {
	secret := "SYNTHETIC-secret"
	cases := []struct{ input, want string }{
		{strings.Repeat("a", 255), strings.Repeat("a", 255)},
		{strings.Repeat("a", 256), strings.Repeat("a", 256)},
		{strings.Repeat("a", 257), strings.Repeat("a", 256) + "..."},
		{strings.Repeat("a", 255) + "éx", strings.Repeat("a", 255) + "..."},
		{strings.Repeat("a", 250) + secret + "suffix", strings.Repeat("a", 250) + "[redac..."},
	}
	for _, tc := range cases {
		s := &session{a: &adapter{opts: Options{Token: secret}}, task: executor.Task{Model: tc.input}}
		r := &roundRun{s: s, modelSeen: true, model: tc.input}
		event := map[string]any{}
		r.addModels(event)
		for _, field := range []string{"requested_model", "model"} {
			if event[field] != tc.want {
				t.Errorf("%s input length %d: got %q want %q", field, len(tc.input), event[field], tc.want)
			}
		}
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
