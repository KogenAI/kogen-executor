package claudecode

import (
	"encoding/json"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestCostBaselineSequences(t *testing.T) {
	cases := []struct {
		name   string
		totals []string
		costs  []any
	}{
		{"normal", []string{"0.10", "0.25", "0.40", "0.40"}, []any{0.1, 0.15, 0.15, 0.0}},
		{"gap", []string{"0.10", "", "", "0.40", "0.55"}, []any{0.1, nil, nil, nil, 0.15}},
		{"reset", []string{"0.50", "0.20", "0.35"}, []any{0.5, nil, 0.15}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := &session{}
			for i, total := range c.totals {
				res := map[string]any{}
				if total != "" {
					res["total_cost_usd"] = json.Number(total)
				}
				u := s.mapUsage(res, "m")
				var got any
				if u.CostUSD != nil {
					got = *u.CostUSD
				}
				if got != c.costs[i] {
					t.Fatalf("round %d cost %v, want %v", i, got, c.costs[i])
				}
			}
		})
	}
}

func TestUnknownCostKeepsTokenUsage(t *testing.T) {
	s := &session{}
	cases := []struct {
		res                   map[string]any
		state                 string
		input, cached, output any
	}{
		{map[string]any{"usage": map[string]any{"input_tokens": json.Number("3"), "cache_read_input_tokens": json.Number("2"), "cache_creation_input_tokens": json.Number("1"), "output_tokens": json.Number("4")}}, executor.UsageComplete, 6, 2, 4},
		{map[string]any{"total_cost_usd": json.Number("0.40"), "usage": map[string]any{"output_tokens": json.Number("4")}}, executor.UsagePartial, nil, nil, 4},
		{map[string]any{"total_cost_usd": json.Number("0.20")}, executor.UsageUnknown, nil, nil, nil},
	}
	value := func(p *int) any {
		if p == nil {
			return nil
		}
		return *p
	}
	for i, c := range cases {
		u := s.mapUsage(c.res, "m")
		if u.CostUSD != nil || u.State != c.state || value(u.Input) != c.input || value(u.Cached) != c.cached || value(u.Output) != c.output || u.Reasoning != nil {
			t.Fatalf("round %d: %+v", i, u)
		}
	}
}
