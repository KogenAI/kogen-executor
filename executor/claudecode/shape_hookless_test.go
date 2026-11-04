package claudecode

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

// Feed the result only after the target mutation, so the snapshot comparison is deterministic.
func TestShapeHooklessSnapshots(t *testing.T) {
	for _, tc := range []struct {
		name                             string
		initial, change, isErr, protocol bool
	}{
		{"success changed", true, true, false, true}, {"success unchanged", true, false, false, true},
		{"error changed", true, true, true, true}, {"error created", false, true, true, true},
		{"error unchanged", true, false, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			p := filepath.Join(root, "a.txt")
			if tc.initial {
				if err := os.WriteFile(p, []byte("before"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			var events []map[string]any
			r := &roundRun{n: 1, init: true, s: &session{role: "shape", root: root, sessionID: "s", pol: policy{Log: filepath.Join(t.TempDir(), "log"), Nonce: "mine"}, emit: func(e map[string]any) { events = append(events, e) }}}
			if err := r.line([]byte(`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"a.txt"}}]}}`)); err != nil {
				t.Fatal(err)
			}
			if tc.change {
				if err := os.WriteFile(p, []byte("after"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			result := `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":false}]}}`
			if tc.isErr {
				result = `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true}]}}`
			}
			err := r.line([]byte(result))
			if tc.protocol {
				wantError(t, err, "executor/protocol")
				if len(events) != 0 {
					t.Fatalf("unexpected events: %v", events)
				}
				return
			}
			if err != nil || len(events) != 2 || events[0]["hook"] != "configuration" || events[0]["decision"] != "deny" || events[1]["denied"] != true {
				t.Fatalf("error %v events %v", err, events)
			}
		})
	}
}

func TestHooklessRoundRoles(t *testing.T) {
	for _, role := range []string{"shape", "build", "review"} {
		for _, isErr := range []bool{false, true} {
			t.Run(role+map[bool]string{true: " error", false: " success"}[isErr], func(t *testing.T) {
				use := map[string]any{"type": "assistant", "message": map[string]any{"content": []any{map[string]any{"type": "tool_use", "id": "t1", "name": "Write", "input": map[string]any{"file_path": "a.txt"}}}}}
				result := map[string]any{"type": "user", "message": map[string]any{"content": []any{map[string]any{"type": "tool_result", "tool_use_id": "t1", "is_error": isErr}}}}
				h := newHarness(t, fakeConfig{RoundEvents: [][]map[string]any{{use, result}}, Script: oneRound(finishRound), Result: map[string]any{"structured_output": map[string]any{"ok": true}}})
				h.task.Role = role
				s := h.startOK()
				_, err := s.Round(context.Background(), executor.Input{})
				if !isErr {
					wantError(t, err, "executor/protocol")
					if len(h.eventsNamed("executor_hook")) != 0 || len(h.eventsNamed("executor_tool")) != 0 {
						t.Fatalf("events %v", h.events)
					}
					return
				}
				if err != nil {
					t.Fatal(err)
				}
				tools := h.eventsNamed("executor_tool")
				hooks := h.eventsNamed("executor_hook")
				if len(tools) != 1 {
					t.Fatalf("events %v", h.events)
				}
				if role == "shape" {
					if tools[0]["denied"] != true || len(hooks) != 1 || hooks[0]["hook"] != "configuration" {
						t.Fatalf("events %v", h.events)
					}
				} else if tools[0]["rejected_before_hook"] != true || tools[0]["denied"] != false || len(hooks) != 0 {
					t.Fatalf("events %v", h.events)
				}
			})
		}
	}
}

// A real fake-child Write exercises the successful hookless path through Round.
func TestShapeHooklessWriteRound(t *testing.T) {
	h := newHarness(t, fakeConfig{SkipHook: true, Script: oneRound(conformance.RoundScript{Actions: []conformance.Action{{Write: &conformance.WriteAction{Path: "a.txt", Content: "after"}}}, End: "finish"})})
	h.task.Role = "shape"
	s := h.startOK()
	_, err := s.Round(context.Background(), executor.Input{})
	wantError(t, err, "executor/protocol")
	if len(h.eventsNamed("executor_hook")) != 0 || len(h.eventsNamed("executor_tool")) != 0 {
		t.Fatalf("events %v", h.events)
	}
}

func TestShapeHooklessUnobservableTarget(t *testing.T) {
	root := t.TempDir()
	p := filepath.Join(root, "large")
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(maxTargetDigest + 1); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	var events []map[string]any
	r := &roundRun{init: true, s: &session{role: "shape", root: root, pol: policy{Log: filepath.Join(t.TempDir(), "log"), Nonce: "mine"}, emit: func(e map[string]any) { events = append(events, e) }}}
	if err := r.line([]byte(`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"large"}}]}}`)); err != nil {
		t.Fatal(err)
	}
	err = r.line([]byte(`{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true}]}}`))
	wantError(t, err, "executor/protocol")
	if len(events) != 0 {
		t.Fatalf("unexpected events: %v", events)
	}
}
