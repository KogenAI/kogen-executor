package contract_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

// successFor is the success result a role submits: Build's claim text, the structured
// submission of Shape and Review.
func successFor(role string) string {
	if role == executor.RoleBuild {
		return resultLine(nil)
	}
	return resultLine(map[string]any{"structured_output": map[string]any{"verdict": "approve"}})
}

func TestFirstPromptLayout(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ role, constraints, consumer string }{
		{executor.RoleBuild, claudecode.Constraints, "kogen-build context_external_test.go review_parts.go"},
		{executor.RoleShape, claudecode.ShapeConstraints, "kogen features/steps/k_review_source_bound_driver.go"},
		{executor.RoleReview, claudecode.ReviewConstraints, "kogen features/steps/k_review_source_bound_driver.go; kogen-build review_parts.go"},
	} {
		t.Run(c.role, func(t *testing.T) {
			t.Parallel()
			r, err := startFake(t, c.role, [][]string{{successFor(c.role)}})
			if err != nil {
				t.Fatalf("Start: %v", err)
			}
			if _, err := r.session.Round(t.Context(), executor.Input{}); err != nil {
				t.Fatalf("Round: %v", err)
			}
			brief := executor.Brief{Stable: "STABLE authority\n", Dynamic: "dynamic evidence"}
			want := c.constraints + "\n\n" + brief.Stable + "\n\n" + brief.Dynamic
			eq(t, "first prompt bytes on stdin for "+c.role+" ("+c.consumer+")", r.fake.prompt(t, 1), want)
			sizer, ok := r.ex.(executor.PromptSizer)
			if !ok {
				t.Fatalf("claudecode.New(...) does not implement executor.PromptSizer (%s)", c.consumer)
			}
			eq(t, "FirstPromptBytes for "+c.role+" ("+c.consumer+")", sizer.FirstPromptBytes(c.role, brief), len(want))
		})
	}
}

func TestBuildFinishClaim(t *testing.T) {
	t.Parallel()
	r, err := startFake(t, executor.RoleBuild, [][]string{{resultLine(map[string]any{"result": "I changed two files."})}})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	res, err := r.session.Round(t.Context(), executor.Input{})
	if err != nil {
		t.Fatalf("Round: %v", err)
	}
	const src = "(kogen-build builder.go)"
	eq(t, "Build success Ending "+src, res.Ending, executor.EndFinish)
	eq(t, "Build success Claim is the result text "+src, res.Claim, "I changed two files.")
	if res.Blocker != nil || len(res.Structured) != 0 {
		t.Errorf("Build success carries a blocker or structured submission %s: %+v", src, res)
	}
	h := r.session.Handle()
	eq(t, "Handle Executor (kogen-build executor_external.go)", h.Executor, executor.ClaudeCode)
	eq(t, "Handle Resume (kogen-build executor_external.go)", h.Resume, executor.ResumeNone)
	eq(t, "Handle Role (kogen-build executor_external.go)", h.Role, executor.RoleBuild)
	if h.SessionID == "" {
		t.Errorf("Handle has no SessionID (kogen-build executor_external.go)")
	}
	deepEq(t, "RoundResult Handle is the session's (kogen-build executor_external.go)", res.Handle, h)
}

func TestBuildBlocker(t *testing.T) {
	t.Parallel()
	blocker := map[string]any{"paths": []string{"protected/contract.txt"}, "reason": "the fixture contradicts the Intent", "evidence": "go test: FAIL"}
	r, err := startFake(t, executor.RoleBuild, [][]string{{resultLine(map[string]any{"structured_output": map[string]any{"blocker": blocker}})}})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	res, err := r.session.Round(t.Context(), executor.Input{})
	if err != nil {
		t.Fatalf("Round: %v", err)
	}
	const src = "(kogen features/steps/k16_cc_builder_blocker_driver.go)"
	eq(t, "Build structured blocker Ending "+src, res.Ending, executor.EndBlocker)
	if res.Blocker == nil {
		t.Fatalf("Build structured blocker gives no BlockerClaim %s", src)
	}
	deepEq(t, "BlockerClaim "+src, *res.Blocker, executor.BlockerClaim{
		Paths: []string{"protected/contract.txt"}, Reason: "the fixture contradicts the Intent", Evidence: "go test: FAIL",
	})
}

func TestStructuredSubmission(t *testing.T) {
	t.Parallel()
	submission := map[string]any{
		"verdict":  "approve",
		"findings": []any{map[string]any{"path": "a.go", "line": 3, "severity": "note", "message": "fine"}},
	}
	for _, c := range []struct{ role, consumer string }{
		{executor.RoleShape, "kogen-shaping shape/external.go"},
		{executor.RoleReview, "kogen-build review_external.go"},
	} {
		t.Run(c.role, func(t *testing.T) {
			t.Parallel()
			r, err := startFake(t, c.role, [][]string{{resultLine(map[string]any{"result": "text, not the submission", "structured_output": submission})}})
			if err != nil {
				t.Fatalf("Start: %v", err)
			}
			res, err := r.session.Round(t.Context(), executor.Input{})
			if err != nil {
				t.Fatalf("Round: %v", err)
			}
			item := "RoundResult.Structured of " + c.role + " (" + c.consumer + ")"
			eq(t, item+" Ending", res.Ending, executor.EndFinish)
			var got any
			if err := json.Unmarshal(res.Structured, &got); err != nil {
				t.Fatalf("%s %q is not JSON: %v", item, res.Structured, err)
			}
			var want any
			if err := json.Unmarshal([]byte(mustJSON(t, submission)), &want); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("%s: got %s, want the result's structured_output %s", item, res.Structured, mustJSON(t, submission))
			}
		})
	}
}

func TestUsageMapping(t *testing.T) {
	t.Parallel()
	r, err := startFake(t, executor.RoleBuild, [][]string{{resultLine(map[string]any{"usage": map[string]any{
		"input_tokens": 10, "cache_read_input_tokens": 700, "cache_creation_input_tokens": 300, "output_tokens": 5,
	}})}})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	res, err := r.session.Round(t.Context(), executor.Input{})
	if err != nil {
		t.Fatalf("Round: %v", err)
	}
	const src = "(kogen-build executor_external.go; kogen cli)"
	u := res.Usage
	eq(t, "Usage.State "+src, u.State, executor.UsageComplete)
	eq(t, "Usage.Source "+src, u.Source, executor.UsageHarness)
	for name, c := range map[string]struct {
		got  *int
		want int
	}{"Input = input + cache_read + cache_creation": {u.Input, 1010}, "Cached = cache_read": {u.Cached, 700}, "CacheWrite = cache_creation": {u.CacheWrite, 300}, "Output = output_tokens": {u.Output, 5}} {
		if c.got == nil {
			t.Errorf("Usage %s is nil %s", name, src)
			continue
		}
		eq(t, "Usage "+name+" "+src, *c.got, c.want)
	}
}

func TestUsageLimitClassification(t *testing.T) {
	t.Parallel()
	r, err := startFake(t, executor.RoleBuild, [][]string{{
		assistantErrorLine("rate_limit"),
		resultLine(map[string]any{"subtype": "success", "is_error": true, "terminal_reason": "api_error"}),
	}})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err = r.session.Round(t.Context(), executor.Input{})
	const item = "rate_limit assistant error then an api_error result fails the round with executor/usage_limit (kogen cli/usage_limit_installed_test.go; kogen-build builder.go)"
	wantError(t, item, err, "executor", executor.ReasonUsageLimit)
	failed := r.events.named("executor_round_failed")
	if len(failed) != 1 {
		t.Fatalf("%s: %d executor_round_failed events, want 1", item, len(failed))
	}
	eq(t, "executor_round_failed reason (kogen-build builder.go)", failed[0]["reason"], any("usage_limit"))
	if detail, _ := failed[0]["detail"].(string); detail == "" {
		t.Errorf("executor_round_failed has no detail (kogen-build builder.go): %v", failed[0])
	}
	// A failed round ends the session: continuation after it is refused.
	_, err = r.session.Round(t.Context(), executor.Input{Feedback: "again"})
	wantError(t, "a round after a failed round (kogen-build builder.go)", err, "executor", executor.ReasonFailed)
}

func TestAuthRouteRefused(t *testing.T) {
	t.Parallel()
	r, err := startFake(t, executor.RoleBuild, [][]string{{resultLine(nil)}}, fakeOptions{APIKeySource: "ANTHROPIC_API_KEY"})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err = r.session.Round(t.Context(), executor.Input{})
	wantError(t, "an init apiKeySource other than none fails with executor/auth_refused (kogen cli/readiness; kogen-build executor_external.go)", err, "executor", executor.ReasonAuthRefused)
	failed := r.events.named("executor_round_failed")
	if len(failed) != 1 {
		t.Fatalf("executor_round_failed events: %d, want 1 (kogen-build executor_external.go)", len(failed))
	}
	eq(t, "executor_round_failed reason (kogen-build executor_external.go)", failed[0]["reason"], any("auth_refused"))
}

func TestRunLogEvents(t *testing.T) {
	t.Parallel()
	r, err := startFake(t, executor.RoleBuild, [][]string{{
		toolUseLine("toolu_read", "Read", map[string]any{"file_path": "README.md"}),
		toolResultLine("toolu_read"),
		resultLine(nil),
	}})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	started := r.events.named("executor_started")
	if len(started) != 1 {
		t.Fatalf("%d executor_started events, want 1 (kogen-build executor_external.go)", len(started))
	}
	sid := r.session.Handle().SessionID
	for k, want := range map[string]any{
		"executor": "claude-code", "contract": "kogen.executor/v2", "role": "build",
		"model": "claude-sonnet-5-5", "session_id": sid,
	} {
		eq(t, "executor_started."+k+" (kogen-build executor_external.go)", started[0][k], want)
	}

	if _, err := r.session.Round(t.Context(), executor.Input{}); err != nil {
		t.Fatalf("Round: %v", err)
	}
	tools := r.events.named("executor_tool")
	if len(tools) != 1 {
		t.Fatalf("%d executor_tool events for one completed Read call, want 1 (kogen-shaping shape/external.go inspectedBy)", len(tools))
	}
	const src = "(kogen-shaping shape/external.go inspectedBy; kogen features/steps/k_hook_prevalidation_driver.go)"
	eq(t, "executor_tool.name "+src, tools[0]["name"], any("Read"))
	eq(t, "executor_tool.tool_use_id "+src, tools[0]["tool_use_id"], any("toolu_read"))
	denied, present := tools[0]["denied"]
	if !present {
		t.Errorf("executor_tool.denied is missing %s: %v", src, tools[0])
	}
	eq(t, "executor_tool.denied "+src, denied, any(false))
}
