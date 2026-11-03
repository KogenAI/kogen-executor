package claudecode

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

var errorUsage = map[string]any{"input_tokens": 10, "cache_read_input_tokens": 20, "cache_creation_input_tokens": 5, "output_tokens": 7}

func failedEvent(t *testing.T, h *harness) map[string]any {
	t.Helper()
	failed := h.eventsNamed("executor_round_failed")
	if len(failed) != 1 {
		t.Fatalf("events %v", h.events)
	}
	return failed[0]
}

func wantKeys(t *testing.T, ev map[string]any, absent ...string) {
	t.Helper()
	for _, k := range absent {
		if _, has := ev[k]; has {
			t.Fatalf("key %q present in %v", k, ev)
		}
	}
}

func jsonOf(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestFailedRoundReportsResult(t *testing.T) {
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: map[string]any{
		"subtype": "error_during_execution", "is_error": true, "terminal_reason": "api_error", "num_turns": 7,
		"total_cost_usd": 0.25, "usage": errorUsage,
	}})
	s := h.startOK()
	_, err := s.Round(context.Background(), executor.Input{})
	wantError(t, err, "executor/failed")
	ev := failedEvent(t, h)
	want := `{"cached":20,"cost_usd":0.25,"input":35,"model":"claude-sonnet-5-5","output":7,"reasoning":null,"source":"harness","state":"complete"}`
	if got := jsonOf(ev["usage"]); got != want {
		t.Fatalf("usage %s, want %s", got, want)
	}
	if ev["num_turns"] != 7 || ev["subtype"] != "error_during_execution" || ev["terminal_reason"] != "api_error" || ev["reason"] != "failed" {
		t.Fatalf("event %v", ev)
	}
}

func TestFailedRoundOmitsUnreported(t *testing.T) {
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: map[string]any{
		"subtype": "error_during_execution", "is_error": true, "terminal_reason": nil, "num_turns": nil, "usage": nil, "total_cost_usd": nil,
	}})
	s := h.startOK()
	_, err := s.Round(context.Background(), executor.Input{})
	wantError(t, err, "executor/failed")
	ev := failedEvent(t, h)
	wantKeys(t, ev, "usage", "num_turns", "terminal_reason")
	if ev["subtype"] != "error_during_execution" {
		t.Fatalf("event %v", ev)
	}

	h = newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: map[string]any{
		"subtype": "error_during_execution", "is_error": true, "usage": map[string]any{"output_tokens": 7}, "total_cost_usd": nil,
	}})
	s = h.startOK()
	_, err = s.Round(context.Background(), executor.Input{})
	wantError(t, err, "executor/failed")
	want := `{"cached":null,"cost_usd":null,"input":null,"model":"claude-sonnet-5-5","output":7,"reasoning":null,"source":"harness","state":"partial"}`
	if got := jsonOf(failedEvent(t, h)["usage"]); got != want {
		t.Fatalf("usage %s, want %s", got, want)
	}
}

func TestFailedRoundWithoutResultHasNoResultKeys(t *testing.T) {
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), NoResult: true})
	s := h.startOK()
	_, err := s.Round(context.Background(), executor.Input{})
	wantError(t, err, "executor/protocol")
	wantKeys(t, failedEvent(t, h), "usage", "num_turns", "subtype", "terminal_reason")
}

func TestFailedRoundCostIsDeltaAndKeepsBaseline(t *testing.T) {
	r := &roundRun{s: &session{prevCost: 0.1}, model: "m", result: map[string]any{"total_cost_usd": json.Number("0.25")}}
	ev := map[string]any{}
	r.addResult(ev)
	if got := ev["usage"].(map[string]any)["cost_usd"]; got != 0.15 {
		t.Fatalf("cost %v", got)
	}
	if r.s.prevCost != 0.1 {
		t.Fatalf("a failed round advanced prevCost to %v", r.s.prevCost)
	}
}

func TestFailedAuthRoundReportsUsage(t *testing.T) {
	h := newHarness(t, fakeConfig{
		Auth:     `{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}`,
		AuthFail: true, Script: oneRound(finishRound),
		Result: map[string]any{"num_turns": 1, "total_cost_usd": 0.5, "usage": errorUsage},
	})
	opts := h.f.options()
	opts.Token = "sk-ant-oat01-SYNTHETIC-BAD"
	s, err := h.start(opts)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	_, err = s.Round(context.Background(), executor.Input{})
	wantError(t, err, "executor/auth_refused")
	ev := failedEvent(t, h)
	if ev["reason"] != "auth_refused" || ev["num_turns"] != 1 || ev["subtype"] != "success" {
		t.Fatalf("event %v", ev)
	}
	usage := ev["usage"].(map[string]any)
	if usage["input"] != 35 || usage["cost_usd"] != 0.5 {
		t.Fatalf("usage %v", usage)
	}
}
