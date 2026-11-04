package claudecode

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestModelUsageProjection(t *testing.T) {
	var res map[string]any
	d := json.NewDecoder(strings.NewReader(`{"modelUsage":{"a":{"inputTokens":0,"cacheReadInputTokens":-1,"outputTokens":"3","costUSD":0.25},"b":{"inputTokens":1.5,"cacheReadInputTokens":0,"outputTokens":2,"costUSD":-1}}}`))
	d.UseNumber()
	if err := d.Decode(&res); err != nil {
		t.Fatal(err)
	}
	event := map[string]any{}
	addModelUsage(event, res)
	want := `[{"cost_usd":0.25,"input":0,"model":"a"},{"cached":0,"input":1.5,"model":"b","output":2}]`
	if got := jsonOf(event["model_usage"]); got != want {
		t.Fatalf("got %s, want %s", got, want)
	}
}

func TestModelUsageExtremeNumbers(t *testing.T) {
	var res map[string]any
	d := json.NewDecoder(strings.NewReader(`{"modelUsage":{"m":{"inputTokens":1e400,"cacheReadInputTokens":-1e-400,"outputTokens":-0e100,"costUSD":1e-400}}}`))
	d.UseNumber()
	if err := d.Decode(&res); err != nil {
		t.Fatal(err)
	}
	event := map[string]any{}
	addModelUsage(event, res)
	want := `[{"cost_usd":1e-400,"input":1e400,"model":"m","output":-0e100}]`
	if got := jsonOf(event["model_usage"]); got != want {
		t.Fatalf("got %s, want %s", got, want)
	}
}
