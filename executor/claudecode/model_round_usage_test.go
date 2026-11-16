package claudecode

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

type mruSession struct {
	t      *testing.T
	s      *session
	events []map[string]any
	n      int
}

func mruNew(t *testing.T) *mruSession {
	root := t.TempDir()
	d := &mruSession{t: t}
	d.s = &session{a: &adapter{}, root: root, role: executor.RoleBuild, sessionID: "s", pol: policy{Log: filepath.Join(root, "hook.log"), Nonce: "n"}, emit: func(e map[string]any) { d.events = append(d.events, e) }}
	return d
}

func mruResult(modelUsage string) string {
	s := `{"type":"result","subtype":"success","is_error":false,"session_id":"s","result":"done"`
	if modelUsage != "" {
		s += `,"modelUsage":` + modelUsage
	}
	return s + `}`
}

func (d *mruSession) ended(modelUsage string) map[string]any {
	d.t.Helper()
	d.n++
	before := len(d.events)
	r := &roundRun{s: d.s, n: d.n, init: true}
	if err := r.line([]byte(mruResult(modelUsage))); err != nil {
		d.t.Fatal(err)
	}
	if _, err := r.finish(0, false, ""); err != nil {
		d.t.Fatal(err)
	}
	for _, e := range d.events[before:] {
		if e["event"] == "executor_round_ended" {
			return e
		}
	}
	d.t.Fatalf("no executor_round_ended event: %v", d.events[before:])
	return nil
}

func (d *mruSession) failed(modelUsage string) map[string]any {
	d.t.Helper()
	d.n++
	var res map[string]any
	dec := json.NewDecoder(strings.NewReader(mruResult(modelUsage)))
	dec.UseNumber()
	if err := dec.Decode(&res); err != nil {
		d.t.Fatal(err)
	}
	event := map[string]any{"event": "executor_round_failed", "round": d.n}
	(&roundRun{s: d.s, n: d.n, model: "m", result: res}).addResult(event)
	return event
}

func mruWant(t *testing.T, ev map[string]any, key, want string) {
	t.Helper()
	got, has := ev[key]
	if want == "<absent>" {
		if has {
			t.Fatalf("%s present as %s", key, jsonOf(got))
		}
		return
	}
	if !has || jsonOf(got) != want {
		t.Fatalf("%s is %s, want %s", key, jsonOf(got), want)
	}
}

func TestModelRoundUsageSecondRoundIsTheDifference(t *testing.T) {
	d := mruNew(t)
	ev := d.ended(`{"m":{"inputTokens":100,"cacheReadInputTokens":1000,"outputTokens":50,"costUSD":4}}`)
	mruWant(t, ev, "model_usage_scope", `"session"`)
	mruWant(t, ev, "model_round_usage", `[{"cached":1000,"cost_usd":4,"input":100,"model":"m","output":50}]`)
	ev = d.ended(`{"m":{"inputTokens":130,"cacheReadInputTokens":1500,"outputTokens":60,"costUSD":4.25}}`)
	mruWant(t, ev, "model_usage_scope", `"session"`)
	mruWant(t, ev, "model_usage", `[{"cached":1500,"cost_usd":4.25,"input":130,"model":"m","output":60}]`)
	mruWant(t, ev, "model_round_usage", `[{"cached":500,"cost_usd":0.25,"input":30,"model":"m","output":10}]`)
}

func TestModelRoundUsagePerModelBaseline(t *testing.T) {
	d := mruNew(t)
	d.ended(`{"a":{"inputTokens":10,"outputTokens":5}}`)
	ev := d.ended(`{"a":{"inputTokens":12,"outputTokens":6},"b":{"inputTokens":7,"outputTokens":3}}`)
	mruWant(t, ev, "model_round_usage", `[{"input":2,"model":"a","output":1},{"input":7,"model":"b","output":3}]`)
	// a model missing from a round keeps its baseline
	d.ended(`{"b":{"inputTokens":8,"outputTokens":3}}`)
	ev = d.ended(`{"a":{"inputTokens":15,"outputTokens":6},"b":{"inputTokens":8,"outputTokens":3}}`)
	mruWant(t, ev, "model_round_usage", `[{"input":3,"model":"a","output":0},{"input":0,"model":"b","output":0}]`)
}

func TestModelRoundUsageRounding(t *testing.T) {
	d := mruNew(t)
	d.ended(`{"m":{"costUSD":0.1}}`)
	ev := d.ended(`{"m":{"costUSD":0.3}}`)
	mruWant(t, ev, "model_round_usage", `[{"cost_usd":0.2,"model":"m"}]`)
}

func TestModelRoundUsageFailedRoundKeepsBaseline(t *testing.T) {
	d := mruNew(t)
	d.ended(`{"m":{"inputTokens":100}}`)
	f := d.failed(`{"m":{"inputTokens":130}}`)
	mruWant(t, f, "model_usage_scope", `"session"`)
	mruWant(t, f, "model_round_usage", `[{"input":30,"model":"m"}]`)
	ev := d.ended(`{"m":{"inputTokens":150}}`)
	mruWant(t, ev, "model_round_usage", `[{"input":50,"model":"m"}]`)
}

func TestModelRoundUsageCounterReset(t *testing.T) {
	d := mruNew(t)
	d.ended(`{"m":{"inputTokens":130,"outputTokens":40}}`)
	ev := d.ended(`{"m":{"inputTokens":40,"outputTokens":45}}`)
	mruWant(t, ev, "model_round_usage", `[{"model":"m","output":5}]`)
	ev = d.ended(`{"m":{"inputTokens":55,"outputTokens":50}}`)
	mruWant(t, ev, "model_round_usage", `[{"input":15,"model":"m","output":5}]`)
	// every field gone: no entry, no key
	f := d.failed(`{"m":{"inputTokens":1,"outputTokens":"x"}}`)
	mruWant(t, f, "model_round_usage", "<absent>")
	mruWant(t, f, "model_usage_scope", `"session"`)
}

func TestModelRoundUsageAbsentBreakdown(t *testing.T) {
	d := mruNew(t)
	ev := d.ended("")
	for _, k := range []string{"model_usage", "model_usage_scope", "model_round_usage"} {
		mruWant(t, ev, k, "<absent>")
	}
	ev = d.ended(`{"m":{"inputTokens":9}}`)
	mruWant(t, ev, "model_usage_scope", `"session"`)
	mruWant(t, ev, "model_round_usage", `[{"input":9,"model":"m"}]`)
}

func TestModelRoundUsageCap(t *testing.T) {
	var parts []string
	for i := 0; i < 22; i++ {
		parts = append(parts, `"m`+string(rune('a'+i))+`":{"inputTokens":1}`)
	}
	d := mruNew(t)
	ev := d.ended("{" + strings.Join(parts, ",") + "}")
	if n := len(ev["model_round_usage"].([]map[string]any)); n != 20 {
		t.Fatalf("entries %d", n)
	}
	if ev["model_usage_omitted"] != 2 {
		t.Fatalf("omitted %v", ev["model_usage_omitted"])
	}
}
