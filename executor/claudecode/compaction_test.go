package claudecode

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

func TestCompactionStreamFields(t *testing.T) {
	var events []map[string]any
	r := &roundRun{init: true, n: 3, s: &session{role: "review", emit: func(e map[string]any) { events = append(events, e) }}}
	lines := []string{
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"auto","pre_tokens":0},"message":"secret-sentinel"}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"manual","pre_tokens":2147483647000}}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"literal","pre_tokens":2147483647001}}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"literal","pre_tokens":-1}}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"literal","pre_tokens":1.5}}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"literal","pre_tokens":"4"}}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"literal"}}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":[]}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":""}}`,
		`{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":4}}`,
		`{"type":"system","subtype":"compact_unknown","compact_metadata":{"trigger":"auto"}}`,
	}
	for _, line := range lines {
		if err := r.line([]byte(line)); err != nil {
			t.Fatal(err)
		}
	}
	want := []map[string]any{}
	for i, trigger := range []string{"auto", "manual", "literal", "literal", "literal", "literal", "literal"} {
		var count any
		if i == 0 {
			count = 0
		}
		if i == 1 {
			count = 2147483647000
		}
		want = append(want, map[string]any{"event": "executor_context_compacted", "role": "review", "round": 3, "trigger": trigger, "pre_tokens": count})
	}
	if !reflect.DeepEqual(events, want) {
		t.Fatalf("events: %#v, want %#v", events, want)
	}
}

func TestCompactionsResetAcrossAdapterRounds(t *testing.T) {
	boundary := map[string]any{"type": "system", "subtype": "compact_boundary", "compact_metadata": map[string]any{"trigger": "auto", "pre_tokens": 12}, "message": "secret-sentinel"}
	h := newHarness(t, fakeConfig{Script: conformance.Script{Rounds: []conformance.RoundScript{finishRound, finishRound}}, RoundEvents: [][]map[string]any{{boundary}, {}}})
	s := h.startOK()
	for i := 0; i < 2; i++ {
		if _, err := s.Round(context.Background(), executor.Input{Feedback: "again"}); err != nil {
			t.Fatal(err)
		}
	}
	ended := h.eventsNamed("executor_round_ended")
	if len(ended) != 2 || ended[0]["compactions"] != 1 || ended[1]["compactions"] != 0 {
		t.Fatalf("ended: %#v", ended)
	}
	got := h.eventsNamed("executor_context_compacted")
	want := []map[string]any{{"event": "executor_context_compacted", "role": "build", "round": 1, "trigger": "auto", "pre_tokens": 12}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("events: %#v", got)
	}
	b, err := json.Marshal(h.events)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "secret-sentinel") {
		t.Fatal("conversation leaked into events")
	}
}
