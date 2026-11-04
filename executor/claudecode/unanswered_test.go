package claudecode

import (
	"path/filepath"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestAcceptedResultReportsOnlyPendingGuardedCalls(t *testing.T) {
	root := t.TempDir()
	var events []map[string]any
	s := &session{a: &adapter{}, root: root, role: executor.RoleBuild, sessionID: "s", pol: policy{Log: filepath.Join(root, "hook.log"), Nonce: "n"}, emit: func(e map[string]any) { events = append(events, e) }}
	r := &roundRun{s: s, n: 3, init: true}
	lines := []string{
		`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"a","name":"Write","input":{"file_path":"a.txt","content":"hello"}},{"type":"tool_use","id":"b","name":"Edit","input":{"file_path":"b.txt"}},{"type":"tool_use","id":"c","name":"Read","input":{"file_path":"c.txt"}}]}}`,
		`{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"a","content":"ok"}]}}`,
		`{"type":"result","subtype":"success","is_error":false,"session_id":"s","result":"done"}`,
	}
	if err := appendSentinel(s.pol.Log, sentinel{Nonce: "n", Hook: "pretool", ToolUseID: "a", Decision: "allow"}); err != nil {
		t.Fatal(err)
	}
	for _, line := range lines {
		if err := r.line([]byte(line)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := r.finish(0, false, ""); err != nil {
		t.Fatal(err)
	}
	tools := map[string]map[string]any{}
	for _, event := range events {
		if event["event"] == "executor_tool" {
			id := event["tool_use_id"].(string)
			if tools[id] != nil {
				t.Fatalf("duplicate tool event: %v", events)
			}
			tools[id] = event
		}
	}
	if len(tools) != 2 || tools["a"]["unanswered"] == true || tools["b"]["unanswered"] != true || tools["b"]["denied"] != false || tools["b"]["round"] != 3 || tools["b"]["name"] != "Edit" {
		t.Fatalf("tool events: %v", tools)
	}
	args, ok := tools["b"]["arguments"].(map[string]any)
	if !ok || args["file_path"] != "b.txt" {
		t.Fatalf("arguments: %#v", tools["b"]["arguments"])
	}
	if _, ok := tools["b"]["result_bytes"]; ok {
		t.Fatalf("unanswered event has invented result: %v", tools["b"])
	}
}

func TestUnansweredHookEvents(t *testing.T) {
	root := t.TempDir()
	var events []map[string]any
	s := &session{a: &adapter{}, root: root, role: executor.RoleBuild, sessionID: "s", pol: policy{Log: filepath.Join(root, "hook.log"), Nonce: "n"}, emit: func(e map[string]any) { events = append(events, e) }}
	r := &roundRun{s: s, n: 2, init: true}
	if err := r.line([]byte(`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"allow","name":"Write","input":{"file_path":"a"}},{"type":"tool_use","id":"deny","name":"Edit","input":{"file_path":"b"}}]}}`)); err != nil {
		t.Fatal(err)
	}
	for _, rec := range []sentinel{{Nonce: "n", Hook: "pretool", ToolUseID: "allow", Decision: "allow"}, {Nonce: "n", Hook: "pretool", ToolUseID: "deny", Decision: "deny"}} {
		if err := appendSentinel(s.pol.Log, rec); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.line([]byte(`{"type":"result","subtype":"success","is_error":false,"session_id":"s","result":"done"}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := r.finish(0, false, ""); err != nil {
		t.Fatal(err)
	}
	hooks, tools := map[string]map[string]any{}, map[string]map[string]any{}
	for _, e := range events {
		id, _ := e["tool_use_id"].(string)
		switch e["event"] {
		case "executor_hook":
			if hooks[id] != nil {
				t.Fatalf("duplicate hook: %v", events)
			}
			hooks[id] = e
		case "executor_tool":
			if tools[id] != nil {
				t.Fatalf("duplicate tool: %v", events)
			}
			tools[id] = e
		}
	}
	for _, tc := range []struct {
		id, name, decision string
		denied             bool
	}{{"allow", "Write", "allow", false}, {"deny", "Edit", "deny", true}} {
		h, tool := hooks[tc.id], tools[tc.id]
		if h["tool_name"] != tc.name || h["decision"] != tc.decision || h["hook"] != "pretool" || h["round"] != 2 || tool["denied"] != tc.denied || tool["unanswered"] != true {
			t.Fatalf("events: %v", events)
		}
	}
	if len(hooks) != 2 || len(tools) != 2 {
		t.Fatalf("events: %v", events)
	}
}
