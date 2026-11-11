// Command k_tool_args_log is the acceptance driver of k-tool-args-log: it runs one real Claude
// Code adapter round against a scripted fake runtime (this same binary) and prints every run-log
// event the adapter emitted, one JSON object per line. It makes no model call.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

// call is one scripted tool call: the tool name and its exact input object.
type call struct {
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}

var guarded = map[string]bool{"Write": true, "Edit": true, "MultiEdit": true, "NotebookEdit": true}

func flag(args []string, name string) string {
	for i, a := range args {
		if a == name && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}

// fake is the scripted runtime round: init, each call's tool_use and tool_result (guarded calls
// outside Shape run the real PreToolUse hook from --settings), then a success result.
func fake(args []string) int {
	var calls []call
	b, err := os.ReadFile(os.Getenv("K_TOOL_ARGS_CALLS"))
	if err != nil || json.Unmarshal(b, &calls) != nil {
		fmt.Fprintln(os.Stderr, "fake runtime: unreadable calls")
		return 70
	}
	role := os.Getenv("K_TOOL_ARGS_ROLE")
	var prompt bytes.Buffer
	prompt.ReadFrom(os.Stdin)
	sid := flag(args, "--session-id")
	cwd, _ := os.Getwd()
	cwd, _ = filepath.EvalSymlinks(cwd)
	out := func(m map[string]any) {
		j, _ := json.Marshal(m)
		os.Stdout.Write(append(j, '\n'))
	}
	source := "none"
	if os.Getenv("K_TOOL_ARGS_BAD_TRANSPORT") == "1" {
		source = "ANTHROPIC_API_KEY"
	}
	out(map[string]any{"type": "system", "subtype": "init", "cwd": cwd, "session_id": sid, "mcp_servers": []any{},
		"model": "claude-sonnet-5-5", "permissionMode": "acceptEdits", "apiKeySource": source, "claude_code_version": "fixture"})
	var settings struct {
		Hooks map[string][]struct {
			Hooks []struct {
				Command string   `json:"command"`
				Args    []string `json:"args"`
			} `json:"hooks"`
		} `json:"hooks"`
	}
	sb, _ := os.ReadFile(flag(args, "--settings"))
	json.Unmarshal(sb, &settings)
	for i, c := range calls {
		id := fmt.Sprintf("toolu_%d", i+1)
		out(map[string]any{"type": "assistant", "session_id": sid, "message": map[string]any{"role": "assistant", "model": "claude-sonnet-5-5",
			"content": []any{map[string]any{"type": "tool_use", "id": id, "name": c.Name, "input": c.Input}}}})
		denied := false
		if guarded[c.Name] {
			denied = true
			if role != executor.RoleShape && len(settings.Hooks["PreToolUse"]) > 0 && len(settings.Hooks["PreToolUse"][0].Hooks) > 0 {
				h := settings.Hooks["PreToolUse"][0].Hooks[0]
				in, _ := json.Marshal(map[string]any{"session_id": sid, "cwd": cwd, "hook_event_name": "PreToolUse",
					"permission_mode": "acceptEdits", "tool_name": c.Name, "tool_input": c.Input, "tool_use_id": id})
				cmd := exec.Command(h.Command, h.Args...)
				cmd.Stdin = bytes.NewReader(in)
				so, err := cmd.Output()
				denied = err != nil || strings.Contains(string(so), `"permissionDecision":"deny"`)
			}
		}
		decision, content := "accept", "ok"
		if denied {
			decision, content = "reject", c.Name+" was denied"
		}
		out(map[string]any{"type": "user", "session_id": sid, "message": map[string]any{"role": "user",
			"content": []any{map[string]any{"type": "tool_result", "tool_use_id": id, "content": content, "is_error": denied}}},
			"tool_result_meta": []any{map[string]any{"id": id, "permission_decision": map[string]any{"decision": decision}}}})
	}
	res := map[string]any{"type": "result", "subtype": "success", "is_error": false, "num_turns": len(calls) + 1,
		"session_id": sid, "result": "done", "terminal_reason": "completed", "permission_denials": []any{}}
	if role != executor.RoleBuild {
		res["structured_output"] = map[string]any{"ok": true}
	}
	out(res)
	return 0
}

// round runs one adapter round of role over the calls file in a fresh temporary checkout and
// returns the emitted events. token is the stored Claude Code token ("" for none).
func round(role, callsPath, token string, extraEnv ...string) ([]map[string]any, error) {
	tmp, err := os.MkdirTemp("", "k-tool-args-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	root, home := filepath.Join(tmp, "checkout"), filepath.Join(tmp, "home")
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(root, "app.txt"), []byte("before\n"), 0o600); err != nil {
		return nil, err
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(claudecode.RuntimeDir(home), 0o700); err != nil {
		return nil, err
	}
	if err := os.Symlink(exe, claudecode.RuntimePath(home)); err != nil {
		return nil, err
	}
	env := append(os.Environ(), "K_TOOL_ARGS_CALLS="+callsPath, "K_TOOL_ARGS_ROLE="+role)
	a := claudecode.New(claudecode.Options{
		Home: home, HookCommand: []string{exe, "hook"}, Token: token,
		Env: append(env, extraEnv...),
	})
	var mu sync.Mutex
	var events []map[string]any
	sink := func(e map[string]any) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, e)
	}
	s, err := a.Start(context.Background(), executor.Task{
		Role: role, Root: root, Home: home, Dir: filepath.Join(tmp, "artifacts"),
		Model: "claude-sonnet-5-5", Effort: "high", RunID: "k-tool-args-log", MaxRounds: 1,
		Schema: []byte(`{"type":"object"}`), Brief: executor.Brief{Stable: "tool argument fixture"},
	}, sink)
	if err != nil {
		return nil, err
	}
	defer s.Close()
	_, err = s.Round(context.Background(), executor.Input{})
	mu.Lock()
	defer mu.Unlock()
	return events, err
}

func tools(events []map[string]any) int {
	n := 0
	for _, e := range events {
		if e["event"] == "executor_tool" {
			n++
		}
	}
	return n
}

// control runs one fixed Shape round with a single Bash call: good with the honest transport,
// bad with a transport the adapter must refuse. It qualifies the scripted runtime, not the feature.
func control(bad bool) int {
	dir, err := os.MkdirTemp("", "k-tool-args-control-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(dir)
	path := filepath.Join(dir, "calls.json")
	if err := os.WriteFile(path, []byte(`[{"name":"Bash","input":{"command":"true"}}]`), 0o600); err != nil {
		panic(err)
	}
	var extra []string
	if bad {
		extra = append(extra, "K_TOOL_ARGS_BAD_TRANSPORT=1")
	}
	events, err := round(executor.RoleShape, path, "", extra...)
	if err != nil {
		fmt.Println("FAIL: round refused")
		return 1
	}
	fmt.Printf("PASS: round accepted with %d tool record\n", tools(events))
	return 0
}

func main() {
	a := os.Args[1:]
	switch {
	case len(a) == 1 && a[0] == "--version":
		fmt.Println(claudecode.Version + " (Claude Code)")
	case len(a) >= 2 && a[0] == "auth" && a[1] == "status":
		fmt.Println(`{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}`)
	case len(a) > 0 && a[0] == "-p":
		os.Exit(fake(a))
	case len(a) > 0 && a[0] == "hook":
		os.Exit(claudecode.RunHook(a[1:], os.Stdin, os.Stdout, os.Stderr))
	case len(a) == 1 && (a[0] == "control-good" || a[0] == "control-bad"):
		os.Exit(control(a[0] == "control-bad"))
	case (len(a) == 3 || len(a) == 4) && a[0] == "run":
		token := ""
		if len(a) == 4 {
			b, err := os.ReadFile(a[3])
			if err != nil {
				fmt.Fprintln(os.Stderr, "unreadable token file:", err)
				os.Exit(66)
			}
			token = string(b)
		}
		events, err := round(a[1], a[2], token)
		for _, e := range events {
			j, jerr := json.Marshal(e)
			if jerr != nil {
				fmt.Fprintln(os.Stderr, "unencodable event:", jerr)
				os.Exit(70)
			}
			fmt.Println(string(j))
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "round failed:", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintln(os.Stderr, "usage: k_tool_args_log run <role> <calls.json> [token-file] | control-good | control-bad")
		os.Exit(64)
	}
}
