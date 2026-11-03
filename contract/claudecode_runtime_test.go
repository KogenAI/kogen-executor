package contract_test

import (
	"bytes"
	"context"
	"encoding/json"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

const ccConsumers = "kogen cli/claude_runtime_test.go cli/readiness/readiness_test.go cli/native.go"

func TestRuntimeLayout(t *testing.T) {
	t.Parallel()
	const h = "/home/user"
	eq(t, "claudecode.Version (kogen cli, kogen-build tests)", claudecode.Version, "2.1.312")
	eq(t, "claudecode.SeamEnv ("+ccConsumers+")", claudecode.SeamEnv, "KOGEN_CLAUDE_CODE_URL")
	eq(t, "claudecode.Root ("+ccConsumers+")", claudecode.Root(h), filepath.Join(h, ".kogen", "claude-code"))
	eq(t, "claudecode.RuntimeDir ("+ccConsumers+")", claudecode.RuntimeDir(h), filepath.Join(claudecode.Root(h), "2.1.312"))
	eq(t, "claudecode.RuntimePath ("+ccConsumers+")", claudecode.RuntimePath(h), filepath.Join(claudecode.RuntimeDir(h), "claude"))
	eq(t, "claudecode.ConfigDir ("+ccConsumers+")", claudecode.ConfigDir(h), filepath.Join(claudecode.Root(h), "config"))
}

func TestPinnedAndMessages(t *testing.T) {
	t.Parallel()
	if !claudecode.Pinned("2.1.312 (Claude Code)") {
		t.Error("claudecode.Pinned refuses `2.1.312 (Claude Code)` (kogen cli/claude_runtime_test.go)")
	}
	if claudecode.Pinned("2.1.300 (Claude Code)") {
		t.Error("claudecode.Pinned accepts `2.1.300 (Claude Code)` (kogen cli/claude_runtime_test.go)")
	}
	eq(t, "claudecode.NotPinnedMessage text (kogen cli/claude_runtime_test.go)",
		claudecode.NotPinnedMessage("/x/claude", "2.1.300 (Claude Code)"),
		"Kogen's Claude Code at /x/claude reports 2.1.300 (Claude Code), not the pinned 2.1.312")
	eq(t, "claudecode.UnsupportedMessage text (kogen cli/readiness/readiness_test.go cli/native.go)",
		claudecode.UnsupportedMessage("windows", "amd64"),
		"Kogen's Claude Code runtime supports macOS on Apple Silicon and Linux x86-64 only, not windows/amd64")
}

func TestProbeRunsInstalledRuntime(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	newFake(t, home, nil)
	out, err := claudecode.Probe(context.Background(), home, "--version")
	if err != nil {
		t.Fatalf("claudecode.Probe --version on the installed fake: %v (kogen cli/claude_runtime_test.go)", err)
	}
	eq(t, "claudecode.Probe answer (kogen cli/claude_runtime_test.go)", strings.TrimSpace(string(out)), "2.1.312 (Claude Code)")
	_, err = claudecode.Probe(context.Background(), t.TempDir(), "--version")
	wantError(t, "claudecode.Probe installs nothing: a missing runtime is unavailable (kogen cli/claude_runtime_test.go)", err, "executor", executor.ReasonUnavailable)
}

func TestDescribe(t *testing.T) {
	t.Parallel()
	requireSupported(t)
	home := t.TempDir()
	newFake(t, home, nil)
	d := claudecode.New(claudecode.Options{Home: home, HookCommand: []string{"/bin/true"}}).Describe()
	const src = "(kogen features/steps/k16_cc_builder_blocker_driver.go)"
	eq(t, "Describe Name "+src, d.Name, "claude-code")
	eq(t, "Describe Contract "+src, d.Contract, "kogen.executor/v2")
	eq(t, "Describe Version "+src, d.Version, "claude-code 2.1.312 (Claude Code)")
	deepEq(t, "Describe aggregate Capabilities "+src, d.Capabilities, executor.Capabilities{
		Roles: []string{"build"}, Resume: "none", Continuation: true, Usage: "harness",
		Prevention: []string{"pretool_hook_write_edit"}, Blocker: true, MaxRounds: 6,
	})
	for _, role := range []string{"shape", "build", "review"} {
		rc, ok := d.For(role)
		if !ok {
			t.Errorf("Describe().For(%s) is not served %s", role, src)
			continue
		}
		eq(t, "Describe "+role+" Blocker "+src, rc.Blocker, role == "build")
		eq(t, "Describe "+role+" Structured "+src, rc.Structured, role != "build")
	}
}

func TestHookDenyAndAllow(t *testing.T) {
	t.Parallel()
	root := realDir(t)
	logPath := filepath.Join(t.TempDir(), "hook-log.jsonl")
	policy := writeJSON(t, filepath.Join(t.TempDir(), "hook-policy.json"), map[string]any{
		"root": root, "protected": []string{"protected/contract.txt"}, "log": logPath, "nonce": "n0nce",
	})
	input := func(path string) string {
		return mustJSON(t, map[string]any{
			"cwd": root, "tool_name": "Write", "tool_use_id": "toolu_1", "tool_input": map[string]any{"file_path": path},
		})
	}
	const src = "(kogen cli/executor_hook_test.go)"
	eq(t, "claudecode.HookSubcommand "+src, claudecode.HookSubcommand, "__kogen_executor_hook")

	var stdout, stderr bytes.Buffer
	code := claudecode.RunHook([]string{"pretool", "--policy", policy}, strings.NewReader(input(filepath.Join(root, "protected", "contract.txt"))), &stdout, &stderr)
	eq(t, "RunHook pretool exit code for a protected path "+src, code, 0)
	eq(t, "RunHook pretool stderr for a protected path "+src, stderr.String(), "")
	out := stdout.String()
	eq(t, "RunHook pretool prints exactly one line "+src, strings.Count(out, "\n") == 1 && strings.HasSuffix(out, "\n"), true)
	var answer map[string]map[string]any
	if err := json.Unmarshal([]byte(out), &answer); err != nil {
		t.Fatalf("RunHook pretool deny answer %q is not the JSON object %s: %v", out, src, err)
	}
	special := answer["hookSpecificOutput"]
	eq(t, "RunHook deny answer has only hookSpecificOutput "+src, len(answer), 1)
	eq(t, "RunHook deny answer hookEventName "+src, special["hookEventName"], any("PreToolUse"))
	eq(t, "RunHook deny answer permissionDecision "+src, special["permissionDecision"], any("deny"))
	eq(t, "RunHook deny answer field count "+src, len(special), 3)
	if reason, _ := special["permissionDecisionReason"].(string); !strings.Contains(reason, "protected path") {
		t.Errorf("RunHook deny reason %q does not contain `protected path` %s", reason, src)
	}

	stdout.Reset()
	stderr.Reset()
	code = claudecode.RunHook([]string{"pretool", "--policy", policy}, strings.NewReader(input(filepath.Join(root, "src", "main.go"))), &stdout, &stderr)
	eq(t, "RunHook pretool exit code for an unprotected path "+src, code, 0)
	eq(t, "RunHook pretool stdout for an unprotected path "+src, stdout.String(), "")
	eq(t, "RunHook pretool stderr for an unprotected path "+src, stderr.String(), "")
}

func TestHookFailuresExitTwo(t *testing.T) {
	t.Parallel()
	root := realDir(t)
	policy := writeJSON(t, filepath.Join(t.TempDir(), "hook-policy.json"), map[string]any{
		"root": root, "protected": []string{"protected/contract.txt"}, "log": filepath.Join(t.TempDir(), "log"), "nonce": "n",
	})
	stdin := mustJSON(t, map[string]any{"cwd": root, "tool_name": "Write", "tool_use_id": "t", "tool_input": map[string]any{"file_path": filepath.Join(root, "a")}})
	for name, args := range map[string][]string{
		"unreadable policy": {"pretool", "--policy", filepath.Join(root, "missing.json")},
		"no arguments":      {},
		"missing file":      {"pretool", "--policy"},
		"wrong flag":        {"pretool", "--config", policy},
		"unknown mode":      {"midtool", "--policy", policy},
		"extra argument":    {"pretool", "--policy", policy, "extra"},
	} {
		var stdout, stderr bytes.Buffer
		code := claudecode.RunHook(args, strings.NewReader(stdin), &stdout, &stderr)
		eq(t, "RunHook exit code for "+name+" (kogen cli/executor_hook_test.go)", code, 2)
		eq(t, "RunHook stdout for "+name+" (kogen cli/executor_hook_test.go)", stdout.String(), "")
	}
}

func requireSupported(t testing.TB) {
	t.Helper()
	if _, ok := claudecode.Supported(); !ok {
		t.Skip(claudecode.UnsupportedMessage(runtime.GOOS, runtime.GOARCH))
	}
}
