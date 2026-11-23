package core

import (
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func costOf(v float64) *float64 { return &v }

func intText(n *int) any {
	if n == nil {
		return nil
	}
	return *n
}

func floatText(f *float64) any {
	if f == nil {
		return nil
	}
	return *f
}

func TestExecutorUsagePlusAddsCompleteRound(t *testing.T) {
	total := ExecutorUsage{
		Input: Count(10), Cached: Count(20), Output: Count(30), Reasoning: Count(40),
		State: executor.UsageComplete, Source: executor.UsageProvider, CostUSD: costOf(0.5),
	}
	round := executor.Usage{
		Input: Count(1), Cached: Count(2), Output: Count(3), Reasoning: Count(4),
		State: executor.UsageComplete, Source: executor.UsageHarness, CostUSD: costOf(0.25),
	}
	got := total.Plus(round, false)
	want := ExecutorUsage{
		Input: Count(11), Cached: Count(22), Output: Count(33), Reasoning: Count(44),
		State: executor.UsageComplete, Source: executor.UsageHarness, CostUSD: costOf(0.75),
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Plus = %+v, want %+v", got, want)
	}
}

func TestExecutorUsagePlusKeepsSourceWhenRoundHasNone(t *testing.T) {
	total := ExecutorUsage{Input: Count(1), Cached: Count(1), Output: Count(1), Reasoning: Count(1), State: executor.UsageComplete, Source: executor.UsageProvider}
	round := executor.Usage{Input: Count(1), Cached: Count(1), Output: Count(1), Reasoning: Count(1), State: executor.UsageComplete}
	if got := total.Plus(round, false).Source; got != executor.UsageProvider {
		t.Fatalf("Source = %q, want %q", got, executor.UsageProvider)
	}
}

func TestExecutorUsagePlusUnknownValuesStayUnknown(t *testing.T) {
	cases := []struct {
		name  string
		total ExecutorUsage
		round executor.Usage
		want  [5]any // input, cached, output, reasoning, cost
	}{
		{
			name:  "round omits a count and the cost",
			total: ExecutorUsage{Input: Count(10), Cached: Count(20), Output: Count(30), Reasoning: Count(40), CostUSD: costOf(1)},
			round: executor.Usage{Input: Count(1), Cached: nil, Output: Count(3), Reasoning: Count(4)},
			want:  [5]any{11, nil, 33, 44, nil},
		},
		{
			name:  "total omits a count and the cost",
			total: ExecutorUsage{Input: Count(10), Cached: Count(20), Output: nil, Reasoning: Count(40)},
			round: executor.Usage{Input: Count(1), Cached: Count(2), Output: Count(3), Reasoning: Count(4), CostUSD: costOf(1)},
			want:  [5]any{11, 22, nil, 44, nil},
		},
		{
			name:  "total and round omit different counts",
			total: ExecutorUsage{Input: nil, Cached: Count(20), Output: Count(30), Reasoning: Count(40), CostUSD: costOf(1)},
			round: executor.Usage{Input: Count(1), Cached: Count(2), Output: nil, Reasoning: Count(4), CostUSD: costOf(2)},
			want:  [5]any{nil, 22, nil, 44, 3.0},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := c.total.Plus(c.round, false)
			have := [5]any{intText(got.Input), intText(got.Cached), intText(got.Output), intText(got.Reasoning), floatText(got.CostUSD)}
			if have != c.want {
				t.Fatalf("totals (input, cached, output, reasoning, cost) = %v, want %v", have, c.want)
			}
		})
	}
}

func TestExecutorUsagePlusState(t *testing.T) {
	cases := []struct {
		name       string
		totalState string
		roundState string
		first      bool
		want       string
	}{
		{"first round uses its own complete state", "", executor.UsageComplete, true, executor.UsageComplete},
		{"first round uses its own partial state", "", executor.UsagePartial, true, executor.UsagePartial},
		{"first round with an empty state is unknown", "", "", true, executor.UsageUnknown},
		{"equal complete states are retained", executor.UsageComplete, executor.UsageComplete, false, executor.UsageComplete},
		{"equal partial states are retained", executor.UsagePartial, executor.UsagePartial, false, executor.UsagePartial},
		{"differing states become partial", executor.UsageComplete, executor.UsageUnknown, false, executor.UsagePartial},
		{"complete after partial becomes partial", executor.UsagePartial, executor.UsageComplete, false, executor.UsagePartial},
		{"empty round state is unknown and equals an unknown total", executor.UsageUnknown, "", false, executor.UsageUnknown},
		{"empty round state is unknown and differs from a complete total", executor.UsageComplete, "", false, executor.UsagePartial},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			total := ExecutorUsage{State: c.totalState}
			got := total.Plus(executor.Usage{State: c.roundState}, c.first)
			if got.State != c.want {
				t.Fatalf("State = %q, want %q", got.State, c.want)
			}
		})
	}
}
