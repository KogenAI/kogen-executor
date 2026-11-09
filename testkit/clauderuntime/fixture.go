// Package clauderuntime is the one fake Claude Code runtime of Executor's tests. It installs a
// POSIX sh script at claudecode.RuntimePath(home) that answers --version and
// `auth status --json` and plays configured rounds, so the production runtime path (Probe, the
// size check and a real claudecode session) accepts it. It is test-only: no production package
// imports it, and the pinned version and size come from package claudecode.
package clauderuntime

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

// Options configure Install. Home and State are directories the caller owns (normally
// t.TempDir() paths); Install writes only under them.
type Options struct {
	Home, State string
	// Rounds[i] holds the stream lines of round i+1 after the init line.
	Rounds [][]string
	// APIKeySource is the init event's apiKeySource (default "none").
	APIKeySource string
	// Checkout is the physical path reported as the init event's cwd.
	Checkout string
}

// Fixture is an installed fake runtime.
type Fixture struct {
	Home, State string
}

// SessionID stands for the session id in round lines; the script replaces it with the id
// passed as --session-id or --resume.
const SessionID = "@SID@"

// AuthStatusJSON is the single line `auth status --json` answers.
const AuthStatusJSON = `{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max"}`

// VersionOutput is what `--version` answers.
func VersionOutput() string { return claudecode.Version + " (Claude Code)\n" }

// Install installs the fake under o.Home and writes <State>/round-<n>.jsonl for each
// configured round. It fails the test when Home or State is empty.
func Install(t testing.TB, o Options) *Fixture {
	t.Helper()
	if o.Home == "" || o.State == "" {
		t.Fatalf("clauderuntime.Install needs Home and State, got %q and %q", o.Home, o.State)
	}
	if o.APIKeySource == "" {
		o.APIKeySource = "none"
	}
	if err := os.MkdirAll(o.State, 0o755); err != nil {
		t.Fatal(err)
	}
	for i, lines := range o.Rounds {
		body := strings.Join(lines, "\n") + "\n"
		if err := os.WriteFile(filepath.Join(o.State, "round-"+strconv.Itoa(i+1)+".jsonl"), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	path := claudecode.RuntimePath(o.Home)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(script(o)), 0o755); err != nil {
		t.Fatal(err)
	}
	// The runtime must have the pinned size of the platform, or the adapter refuses it; the
	// script exits before the sparse padding.
	if size, ok := claudecode.RuntimeSize(); ok {
		if err := os.Truncate(path, size); err != nil {
			t.Fatal(err)
		}
	}
	return &Fixture{Home: o.Home, State: o.State}
}

// Prompt is the bytes the fake read from stdin in round n.
func (f *Fixture) Prompt(t testing.TB, n int) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(f.State, fmt.Sprintf("prompt-%d.bin", n)))
	if err != nil {
		t.Fatalf("the fake claude saved no prompt for round %d: %v", n, err)
	}
	return string(b)
}

// Stream lines of a synthetic round.

// ResultLine is a success result of session SessionID, with extra merged over it.
func ResultLine(extra map[string]any) string {
	m := map[string]any{
		"type": "result", "subtype": "success", "is_error": false, "result": "done", "session_id": SessionID,
		"num_turns": 1, "terminal_reason": "completed",
	}
	for k, v := range extra {
		m[k] = v
	}
	return line(m)
}

// ToolUseLine is an assistant message calling a tool.
func ToolUseLine(id, name string, input map[string]any) string {
	return line(map[string]any{"type": "assistant", "message": map[string]any{"content": []any{
		map[string]any{"type": "tool_use", "id": id, "name": name, "input": input}}}})
}

// ToolResultLine is the allowed result of the tool call id.
func ToolResultLine(id string) string {
	return line(map[string]any{
		"type": "user", "message": map[string]any{"content": []any{
			map[string]any{"type": "tool_result", "tool_use_id": id, "content": "ok"}}},
		"tool_result_meta": []any{map[string]any{"id": id, "permission_decision": map[string]any{"decision": "allow"}}},
	})
}

// AssistantErrorLine is an assistant message that carries an error code.
func AssistantErrorLine(code string) string {
	return line(map[string]any{"type": "assistant", "error": code, "message": map[string]any{"content": []any{}}})
}

func line(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}
