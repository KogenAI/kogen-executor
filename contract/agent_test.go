package contract_test

import (
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/agent"
	"kogen-loop/provider"
	"kogen-loop/sys"
)

const agentConsumers = "kogen-build, kogen-shaping, kogen-setup, kogen-review, kogen cli"

// TestAgentToolNames pins the generic tool definitions a phase hands a request beside its own:
// agent.Defs dispatches kogen-loop's generic tools, in order, and refuses any other name; the
// phases' own tools (finish, report_blocker, probe, propose_files, the submit_* tools,
// shape_batch, worker_result) are defined and pinned by the phases that own them (kogen-build,
// kogen-shaping, kogen-setup, kogen-review).
func TestAgentToolNames(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"shell", "view_image", "read_file", "write_file", "list_files", "search_text", "documentation"} {
		defs := agent.Defs(name)
		if len(defs) != 1 {
			t.Errorf("agent.Defs(%q) returns %d definitions, want 1 (%s)", name, len(defs), agentConsumers)
			continue
		}
		eq(t, "agent.Defs("+name+") name ("+agentConsumers+")", defs[0]["name"], any(name))
	}
	for _, name := range []string{"finish", "submit_review", "submit"} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("agent.Defs(%q) defined a phase's own tool (%s)", name, agentConsumers)
				}
			}()
			agent.Defs(name)
		}()
	}
	flat := agent.AsAny(agent.Defs("shell"), agent.Defs("read_file", "list_files"))
	eq(t, "agent.AsAny flattens definitions ("+agentConsumers+")", len(flat), 3)
}

// TestAgentPrompts pins the shared prompt material and the template mechanism: the testing
// rules (kogen cli/testing_rules_test.go, kogen-build builder.go, kogen-review material.go, kogen-shaping
// refine.go and context.go) and agent.Render, with which a phase renders its own prompt
// templates (kogen-shaping shape/policy.go).
func TestAgentPrompts(t *testing.T) {
	t.Parallel()
	eq(t, "agent.TestingRules value ("+agentConsumers+")", agent.TestingRules, "testing-rules")
	names := agent.Names()
	eq(t, "agent.Names count ("+agentConsumers+")", len(names), 1)
	for _, name := range names {
		if agent.Prompt(name) == "" {
			t.Errorf("agent.Prompt(%q) is empty (%s)", name, agentConsumers)
		}
	}
	eq(t, "agent.Render replaces each {{name}} (kogen-shaping shape/policy.go)",
		agent.Render("{{a}} and {{b}}, not {{c}}", map[string]string{"a": "x", "b": "{{a}}"}), "x and {{a}}, not {{c}}")
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
