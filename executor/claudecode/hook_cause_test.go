package claudecode

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func hookCauseRun(t *testing.T, env []string, lines ...string) *roundRun {
	t.Helper()
	root := t.TempDir()
	s := &session{a: &adapter{opts: Options{Env: env}}, root: root, role: executor.RoleBuild, sessionID: "s", pol: policy{Log: filepath.Join(root, "hook.log"), Nonce: "n"}, emit: func(map[string]any) {}}
	r := &roundRun{s: s, n: 1, init: true}
	for _, l := range lines {
		if err := r.line([]byte(l)); err != nil {
			t.Fatal(err)
		}
	}
	return r
}

func TestHookEventsAttributedPerCall(t *testing.T) {
	const use = `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"w1","name":"Write","input":{"file_path":"a"}},{"type":"tool_use","id":"e1","name":"Edit","input":{"file_path":"b"}},{"type":"tool_use","id":"w2","name":"Write","input":{"file_path":"c"}}]}}`
	r := hookCauseRun(t, nil, use,
		`{"type":"system","subtype":"hook_started","hook_id":"x","hook_name":"PostToolUse:Write","hook_event":"PostToolUse"}`,
		`{"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"}`,
		`{"type":"system","subtype":"hook_started","hook_id":"h2","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"}`,
		`{"type":"system","subtype":"hook_started","hook_id":"h3","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"}`,
		`{"type":"system","subtype":"hook_response","hook_id":"h2","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","stderr":"two","exit_code":2,"outcome":"error"}`,
		`{"type":"system","subtype":"hook_response","hook_id":"nope","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","stderr":"lost","exit_code":3,"outcome":"error"}`)
	for id, want := range map[string]string{"w1": "no_response", "w2": "exit_2 two", "e1": "not_started"} {
		err := r.hookFailure(id, r.guarded[id])
		cause := r.hookCause
		if r.hookStderr != "" {
			cause += " " + r.hookStderr
		}
		if cause != want || !strings.Contains(err.Error(), "hook_cause "+strings.Fields(want)[0]) {
			t.Errorf("%s: cause %q, want %q (%v)", id, cause, want, err)
		}
	}
}

func TestHookStderrRedactsSecretEnvValue(t *testing.T) {
	r := hookCauseRun(t, []string{"API_TOKEN=env-secret-value-12345"},
		`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"w1","name":"Write","input":{"file_path":"a"}}]}}`,
		`{"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"}`,
		`{"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","stderr":"  bad env-secret-value-12345 \n","exit_code":2,"outcome":"error"}`)
	r.hookFailure("w1", "Write")
	if r.hookStderr != "bad [redacted]" || r.hookCause != "exit_2" {
		t.Fatalf("cause %q stderr %q", r.hookCause, r.hookStderr)
	}
}
