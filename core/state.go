// Package core is what kogen-build and kogen-review share: the token totals of a conversation,
// the record of a review, an external executor's state and usage, the review material and the
// small encodings both write (JSON without HTML escaping, hashes, empty lists, display of JSON
// values). The persisted Build state, the run record and the stages are kogen-build's own; the
// review's contract (its input, Env and result) is kogen-review's.
package core

import (
	"strconv"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-executor/executor"
	"kogen-loop/provider"
)

// Tokens is a token total, as a Build's run record and checkpoint hold it. A count is nil
// (JSON null, shown as "unknown") once a request did not report it: unknown stays unknown
// in every sum.
type Tokens struct {
	Input     *int `json:"input"`
	Cached    *int `json:"cached"`
	Output    *int `json:"output"`
	Reasoning *int `json:"reasoning"`
}

// Count is a known token count.
func Count(n int) *int { return &n }

// ZeroTokens is the total of no requests.
func ZeroTokens() Tokens { return Tokens{Count(0), Count(0), Count(0), Count(0)} }

func addCounts(a, b *int) *int {
	if a == nil || b == nil {
		return nil
	}
	return Count(*a + *b)
}

// Plus is the sum of two totals: unknown stays unknown.
func (t Tokens) Plus(u Tokens) Tokens {
	return Tokens{addCounts(t.Input, u.Input), addCounts(t.Cached, u.Cached), addCounts(t.Output, u.Output), addCounts(t.Reasoning, u.Reasoning)}
}

func fromUsage(u provider.Usage) Tokens {
	return Tokens{Count(u.Input), Count(u.Cached), Count(u.Output), Count(u.Reasoning)}
}

// ResponseTokens is what one response adds to the totals. Anthropic reports no reasoning
// count and may omit any other, so its totals come from the validated analytical usage; the
// other routes' compatible totals are always integers.
func ResponseTokens(role project.Role, resp *provider.Response) Tokens {
	if provider.Name(ProviderRole(role)) == "anthropic" {
		k := resp.Known
		return Tokens{k.Input, k.Cached, k.Output, k.Reasoning}
	}
	return fromUsage(resp.Usage)
}

func countText(n *int) string {
	if n == nil {
		return "unknown"
	}
	return strconv.Itoa(*n)
}

// Line is the progress text `input=… cached=… output=… reasoning=…`.
func (t Tokens) Line() string {
	return "input=" + countText(t.Input) + " cached=" + countText(t.Cached) + " output=" + countText(t.Output) + " reasoning=" + countText(t.Reasoning)
}

// Total is input plus output, or "unknown".
func (t Tokens) Total() string {
	if t.Input == nil || t.Output == nil {
		return "unknown"
	}
	return strconv.Itoa(*t.Input + *t.Output)
}

// ReviewRecord is the latest review: its number, verdict ("approve", "changes", "pending" or
// "invalid"), findings (as the reviewer submitted them: path, line, severity, message) and the
// candidate tree it judged.
type ReviewRecord struct {
	N        int              `json:"n"`
	Verdict  string           `json:"verdict"`
	Findings []map[string]any `json:"findings"`
	Tree     string           `json:"tree,omitempty"`
}

// ExecutorState is an external executor's identity and its running totals in a Build:
// harness-reported figures, never provider-exact and never a bill.
type ExecutorState struct {
	Name      string        `json:"name"`
	Version   string        `json:"version"`
	SessionID string        `json:"session_id"`
	Rounds    int           `json:"rounds"`
	Usage     ExecutorUsage `json:"usage"`
}

// ExecutorUsage sums the usage the executor reported over the rounds. A count is nil once a
// round did not report it (unknown stays unknown); CostUSD is the harness's own estimate.
type ExecutorUsage struct {
	Input     *int     `json:"input"`
	Cached    *int     `json:"cached"`
	Output    *int     `json:"output"`
	Reasoning *int     `json:"reasoning"`
	State     string   `json:"state"`
	Source    string   `json:"source"`
	CostUSD   *float64 `json:"cost_usd,omitempty"`
}

// Plus adds a round's reported usage. A count is nil as soon as one round lacks it; the cost
// is the harness's own estimate and unknown the same way. The state is the rounds' own state
// when they agree and partial when they differ (first: no round was added before).
func (u ExecutorUsage) Plus(r executor.Usage, first bool) ExecutorUsage {
	out := ExecutorUsage{
		Input: addCounts(u.Input, r.Input), Cached: addCounts(u.Cached, r.Cached),
		Output: addCounts(u.Output, r.Output), Reasoning: addCounts(u.Reasoning, r.Reasoning), Source: u.Source,
	}
	if r.Source != "" {
		out.Source = r.Source
	}
	if u.CostUSD != nil && r.CostUSD != nil {
		sum := *u.CostUSD + *r.CostUSD
		out.CostUSD = &sum
	}
	state := r.State
	if state == "" {
		state = executor.UsageUnknown
	}
	switch {
	case first || state == u.State:
		out.State = state
	default:
		out.State = executor.UsagePartial
	}
	return out
}

// ProviderRole is a configured role as the provider needs it.
func ProviderRole(r project.Role) provider.Role {
	return provider.Role{Provider: r.Provider, Model: r.Model, Effort: r.Effort, BaseURL: r.BaseURL}
}
