package claudecode

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestDenialProjection(t *testing.T) {
	for _, n := range []int{0, 31, 32, 33, 200} {
		d := make([]any, n)
		for i := range d {
			d[i] = map[string]any{"tool_name": fmt.Sprint(i), "tool_use_id": fmt.Sprint(i), "tool_input": map[string]any{"number": json.Number("1.5")}}
		}
		ev := map[string]any{}
		(&roundRun{s: &session{}, result: map[string]any{"permission_denials": d}}).addDenials(ev)
		calls := ev["permission_denial_calls"].([]any)
		if len(calls) != min(n, 32) || ev["permission_denials"] != n || ev["permission_denials_omitted"] != n-len(calls) {
			t.Fatalf("%d: %v", n, ev)
		}
		for i, c := range calls {
			want := map[string]any{"name": fmt.Sprint(i), "tool_use_id": fmt.Sprint(i), "arguments": map[string]any{"number": json.Number("1.5")}}
			if !reflect.DeepEqual(c, want) {
				t.Fatalf("%v", c)
			}
		}
	}
	for _, v := range []any{nil, "bad"} {
		ev := map[string]any{}
		(&roundRun{s: &session{}, result: map[string]any{"permission_denials": v}}).addDenials(ev)
		if !reflect.DeepEqual(ev, map[string]any{"permission_denials": 0}) {
			t.Fatal(ev)
		}
	}
	d := []any{42, map[string]any{}, map[string]any{"tool_name": ""}, map[string]any{"tool_name": "ok", "tool_use_id": 42, "tool_input": []any{}}}
	ev := map[string]any{}
	(&roundRun{s: &session{}, result: map[string]any{"permission_denials": d}}).addDenials(ev)
	if jsonOf(ev) != `{"permission_denial_calls":[{"arguments":null,"name":"ok"}],"permission_denials":4,"permission_denials_omitted":3}` {
		t.Fatal(ev)
	}
}

func TestDenialBoundsAndSecrets(t *testing.T) {
	for _, n := range []int{4095, 4096, 4097} {
		text := strings.Repeat("x", n)
		r := &roundRun{s: &session{}, result: map[string]any{"permission_denials": []any{map[string]any{"tool_name": text, "tool_use_id": text, "tool_input": map[string]any{"text": text, "api_key": "s3cret", "nested": map[string]any{"password": 42, "ok": true}}}}}}
		ev := map[string]any{}
		r.addDenials(ev)
		call := ev["permission_denial_calls"].([]any)[0].(map[string]any)
		args := call["arguments"].(map[string]any)
		if !reflect.DeepEqual(call["name"], boundString(text)) || !reflect.DeepEqual(call["tool_use_id"], boundString(text)) || !reflect.DeepEqual(args["text"], boundString(text)) || args["api_key"] != "[redacted]" || jsonOf(args["nested"]) != `{"ok":true,"password":"[redacted]"}` {
			t.Fatal(call)
		}
	}
	for _, n := range []int{65535, 65536, 65537} {
		// Use an array of short strings to avoid the individual string bound.
		parts := []any{}
		remaining := n - len(`{"k":[]}`)
		for remaining > 0 {
			size := min(4000, remaining-2)
			if len(parts) > 0 {
				size--
			}
			parts = append(parts, strings.Repeat("x", size))
			remaining -= size + 2
			if len(parts) > 1 {
				remaining--
			}
		}
		input := map[string]any{"k": parts}
		encoded, _ := json.Marshal(input)
		if len(encoded) != n {
			t.Fatalf("size %d", len(encoded))
		}
		r := &roundRun{s: &session{}, result: map[string]any{"permission_denials": []any{map[string]any{"tool_name": "tool", "tool_input": input}}}}
		ev := map[string]any{}
		r.addDenials(ev)
		got := ev["permission_denial_calls"].([]any)[0].(map[string]any)["arguments"]
		want := any(input)
		if n > 65536 {
			want = map[string]any{"truncated": true, "bytes": n, "sha256": sha256Hex(encoded)}
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("size %d", n)
		}
	}
}

func TestDenialsDoNotChangeRoundOutcome(t *testing.T) {
	for _, failed := range []bool{false, true} {
		var results []executor.RoundResult
		var errs []string
		var usages []string
		for _, with := range []bool{false, true} {
			result := map[string]any{"is_error": failed, "usage": errorUsage}
			if with {
				result["permission_denials"] = []any{map[string]any{"tool_name": "WebFetch", "tool_input": map[string]any{"api_key": "s3cret"}}}
			}
			h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: result})
			s := h.startOK()
			out, err := s.Round(context.Background(), executor.Input{})
			results = append(results, out)
			if err != nil {
				errs = append(errs, err.Error())
			} else {
				errs = append(errs, "")
			}
			name := "executor_round_ended"
			if failed {
				name = "executor_round_failed"
			}
			events := h.eventsNamed(name)
			if len(events) != 1 {
				t.Fatal(h.events)
			}
			usages = append(usages, jsonOf(events[0]["usage"]))
			if with && jsonOf(events[0]["permission_denial_calls"]) != `[{"arguments":{"api_key":"[redacted]"},"name":"WebFetch"}]` {
				t.Fatal(events[0])
			}
		}
		// Session handles are generated independently.
		results[0].Handle = results[1].Handle
		if !reflect.DeepEqual(results[0], results[1]) || errs[0] != errs[1] || usages[0] != usages[1] {
			t.Fatalf("%v %v %v", results, errs, usages)
		}
	}
}

func TestDenialStoredTokenRedacted(t *testing.T) {
	const token = "stored-token-fixture-987654"
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: map[string]any{"permission_denials": []any{map[string]any{"tool_name": "name-" + token, "tool_use_id": token, "tool_input": map[string]any{"text": token}}}}})
	opts := h.f.options()
	opts.Token = token
	s, err := h.start(opts)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err = s.Round(context.Background(), executor.Input{}); err != nil {
		t.Fatal(err)
	}
	events := h.eventsNamed("executor_round_ended")
	if len(events) != 1 {
		t.Fatal(h.events)
	}
	if got := jsonOf(events[0]["permission_denial_calls"]); got != `[{"arguments":{"text":"[redacted]"},"name":"name-[redacted]","tool_use_id":"[redacted]"}]` {
		t.Fatal(got)
	}
}
