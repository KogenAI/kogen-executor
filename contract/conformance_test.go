package contract_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

func TestConformanceConstants(t *testing.T) {
	t.Parallel()
	const src = "(kogen-build executor_native_test.go; kogen features/steps/k12_adapter_driver.go)"
	eq(t, "conformance.ProtectedPath "+src, conformance.ProtectedPath, "protected/contract.txt")
	eq(t, "conformance.ProtectedContent "+src, conformance.ProtectedContent, "approved contract\n")
	eq(t, "conformance.ChildPIDPath "+src, conformance.ChildPIDPath, ".conformance/child.pid")
}

func TestNewCheckout(t *testing.T) {
	t.Parallel()
	const src = "(kogen-build executor_native_test.go; kogen features/steps/k12_adapter_driver.go)"
	root := conformance.NewCheckout(t)
	if real, err := filepath.EvalSymlinks(root); err != nil || real != root {
		t.Errorf("conformance.NewCheckout %q is not a physical path (%v) %s", root, err, src)
	}
	git := func(args ...string) string {
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v in the checkout: %v\n%s %s", args, err, out, src)
		}
		return strings.TrimSpace(string(out))
	}
	eq(t, "NewCheckout commit count "+src, git("rev-list", "--count", "HEAD"), "1")
	eq(t, "NewCheckout status "+src, git("status", "--porcelain"), "")
	b, err := os.ReadFile(filepath.Join(root, conformance.ProtectedPath))
	if err != nil {
		t.Fatalf("NewCheckout has no ProtectedPath file: %v %s", err, src)
	}
	eq(t, "NewCheckout ProtectedPath content "+src, string(b), conformance.ProtectedContent)
}

func TestScriptsLoad(t *testing.T) {
	t.Parallel()
	scripts, err := conformance.Scripts()
	if err != nil {
		t.Fatalf("conformance.Scripts: %v (kogen-build executor_native_test.go; kogen features/steps/k12_adapter_driver.go)", err)
	}
	if len(scripts) == 0 {
		t.Error("conformance.Scripts is empty (kogen-build executor_native_test.go)")
	}
}

// driver is a consumer-style conformance driver (kogen features/steps/k12_adapter_driver.go).
type driver struct{}

func (driver) Name() string { return executor.ClaudeCode }
func (driver) Prepare(t *testing.T, root string, s conformance.Script) (executor.Executor, executor.Task) {
	return fakeExecutor{}, executor.Task{Role: s.RoleOf()}
}
func (driver) Feedback(t *testing.T) []string { return nil }

var (
	_ conformance.Driver = driver{}
	_                    = conformance.Run
)

// TestConformanceTypesConsumersConstruct pins the script type and field names the consumers use.
func TestConformanceTypesConsumersConstruct(t *testing.T) {
	t.Parallel()
	s := conformance.Script{
		Name: "x", Only: executor.ClaudeCode, Role: executor.RoleShape, Needs: []string{executor.PreventPreToolWrite},
		DeadlineSeconds: 1, CancelAfterSeconds: 1,
		Rounds: []conformance.RoundScript{{
			Actions: []conformance.Action{
				{Write: &conformance.WriteAction{Path: "a", Content: "b"}},
				{Shell: "true", SleepSeconds: 1, SpawnOrphan: true},
			},
			End: "finish", Claim: "c", Usage: &conformance.ScriptUsage{Input: 1, Cached: 2, Output: 3},
			Structured: []byte(`{}`), HarnessError: true, Malformed: true, APIKeyAuth: true,
		}},
		Expect: conformance.Expect{
			Rounds: []conformance.ExpectRound{{Ending: executor.EndFinish, UsageState: executor.UsageComplete, Structured: []byte(`{}`)}},
			Error:  "executor/failed", Files: map[string]string{"a": "b"}, Absent: []string{"c"},
			Protected: "unchanged", NoLiveChild: true, FeedbackSeen: true,
		},
	}
	eq(t, "conformance.Script.RoleOf (kogen features/steps/k12_adapter_driver.go)", s.RoleOf(), executor.RoleShape)
	eq(t, "conformance.Script.RoleOf default (kogen features/steps/k12_adapter_driver.go)", conformance.Script{}.RoleOf(), executor.RoleBuild)
	eq(t, "conformance.ScriptUsage fields (kogen features/steps/k12_adapter_driver.go)", s.Rounds[0].Usage.Input+s.Rounds[0].Usage.Cached+s.Rounds[0].Usage.Output, 6)
}
