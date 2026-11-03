package contract_test

import (
	"strings"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/agent"
	"kogen-loop/provider"
	"kogen-loop/sys"
)

const agentConsumers = "kogen-build, kogen-shaping, kogen cli"

func TestAgentToolNames(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, got, want string }{
		{"ProbeTool", agent.ProbeTool, "probe"},
		{"FinishTool", agent.FinishTool, "finish"},
		{"ReportBlockerTool", agent.ReportBlockerTool, "report_blocker"},
		{"ProposeFilesTool", agent.ProposeFilesTool, "propose_files"},
		{"SubmitTool", agent.SubmitTool, "submit"},
		{"SubmitReviewTool", agent.SubmitReviewTool, "submit_review"},
		{"SubmitRefinementTool", agent.SubmitRefinementTool, "submit_refinement"},
		{"SubmitConfigurationTool", agent.SubmitConfigurationTool, "submit_configuration"},
		{"ShapeBatchTool", agent.ShapeBatchTool, "shape_batch"},
		{"WorkerResultTool", agent.WorkerResultTool, "worker_result"},
	} {
		eq(t, "agent."+c.name+" value ("+agentConsumers+")", c.got, c.want)
		defs := agent.Defs(c.want)
		if len(defs) != 1 {
			t.Errorf("agent.Defs(%q) returns %d definitions, want 1 (%s)", c.want, len(defs), agentConsumers)
			continue
		}
		eq(t, "agent.Defs("+c.want+") name ("+agentConsumers+")", defs[0]["name"], any(c.want))
	}
	flat := agent.AsAny(agent.Defs(agent.ProbeTool), agent.Defs(agent.FinishTool, agent.SubmitTool))
	eq(t, "agent.AsAny flattens definitions ("+agentConsumers+")", len(flat), 3)
}

func TestAgentPrompts(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ name, got, want string }{
		{"Builder", agent.Builder, "builder"},
		{"Reviewer", agent.Reviewer, "reviewer"},
		{"Shaper", agent.Shaper, "shaper"},
		{"Refine", agent.Refine, "refine"},
		{"Init", agent.Init, "init"},
		{"ShaperContextGuidance", agent.ShaperContextGuidance, "shaper-context-guidance"},
		{"ReadinessAcknowledgmentGuidance", agent.ReadinessAcknowledgmentGuidance, "readiness-acknowledgment-guidance"},
		{"FeasibilityGuidance", agent.FeasibilityGuidance, "feasibility-guidance"},
		{"TestingRules", agent.TestingRules, "testing-rules"},
	} {
		eq(t, "agent."+c.name+" value ("+agentConsumers+")", c.got, c.want)
	}
	names := agent.Names()
	eq(t, "agent.Names count ("+agentConsumers+")", len(names), 9)
	for _, name := range names {
		if agent.Prompt(name) == "" {
			t.Errorf("agent.Prompt(%q) is empty (%s)", name, agentConsumers)
		}
	}
	eq(t, "agent.Prompt(Reviewer) carries LimitRaises exactly once (kogen-build review_lineup_test.go review_parts.go)",
		strings.Count(agent.Prompt(agent.Reviewer), "\n"+agent.LimitRaises+"\n"), 1)
}

func TestWithOriginHint(t *testing.T) {
	t.Parallel()
	const src = "(kogen cli/compatible_login_test.go)"
	eq(t, "agent.OriginRelogin text "+src, agent.OriginRelogin, "log in again for that origin with: kogen provider login openai-compatible")
	refused := sys.Fail("provider", "refused", "the saved key belongs to https://a.example, not https://b.example", 1)
	hinted := agent.WithOriginHint(refused)
	deepEq(t, "agent.WithOriginHint appends OriginRelogin to provider/refused with ` key belongs to ` "+src, hinted.Lines, []string{agent.OriginRelogin})
	eq(t, "agent.WithOriginHint keeps the class, reason and detail "+src, hinted.Class+"/"+hinted.Reason+": "+hinted.Detail, refused.Class+"/"+refused.Reason+": "+refused.Detail)
	for name, e := range map[string]*sys.Error{
		"another reason":  sys.Fail("provider", "unavailable", "the saved key belongs to x", 1),
		"another class":   sys.Fail("executor", "refused", "the saved key belongs to x", 1),
		"another detail":  sys.Fail("provider", "refused", "no key", 1),
		"already hinted":  {Class: "provider", Reason: "refused", Detail: "the saved key belongs to x", Lines: []string{agent.OriginRelogin}},
		"a hint-free nil": nil,
	} {
		if got := agent.WithOriginHint(e); got != e {
			t.Errorf("agent.WithOriginHint changes %s %s: %+v", name, src, got)
		}
	}
}

func TestResponseBudget(t *testing.T) {
	t.Parallel()
	const src = "(kogen cli/response_budget_test.go)"
	eq(t, "agent.BuildReviewBudget "+src, agent.BuildReviewBudget, 10*time.Minute)
	deepEq(t, "agent.BudgetEvent of a Build/Review client "+src, agent.BudgetEvent(&provider.Client{ResponseBudget: agent.BuildReviewBudget}),
		map[string]any{"event": "response_budget", "budget_ms": int64(600000), "budget": "10 minutes"})
	deepEq(t, "agent.BudgetEvent of the default budget "+src, agent.BudgetEvent(nil),
		map[string]any{"event": "response_budget", "budget_ms": int64(1800000), "budget": "30 minutes"})

	expired := sys.Fail("provider", "unavailable", "the provider did not answer: response wait exceeded 10m0s", 1)
	renamed, ok := agent.NameBudgetExpiry(expired, agent.BuildReviewBudget).(*sys.Error)
	if !ok {
		t.Fatalf("agent.NameBudgetExpiry does not return a *sys.Error %s", src)
	}
	eq(t, "agent.NameBudgetExpiry renames 10m0s to 10 minutes "+src, renamed.Detail, "the provider did not answer: response wait exceeded 10 minutes")
	eq(t, "agent.NameBudgetExpiry keeps the class and reason "+src, renamed.Class+"/"+renamed.Reason, "provider/unavailable")
}
