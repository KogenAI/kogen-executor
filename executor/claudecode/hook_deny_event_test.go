package claudecode

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

// denyRound runs one scripted Write to path and returns the harness after the round.
func denyRound(t *testing.T, path string) *harness {
	t.Helper()
	h := newHarness(t, fakeConfig{Script: oneRound(conformance.RoundScript{
		Actions: []conformance.Action{{Write: &conformance.WriteAction{Path: path, Content: "tampered"}}}, End: "finish",
	})})
	if _, err := h.startOK().Round(context.Background(), executor.Input{}); err != nil {
		t.Fatal(err)
	}
	return h
}

func denyEvent(t *testing.T, h *harness) map[string]any {
	t.Helper()
	var denies []map[string]any
	for _, e := range h.eventsNamed("executor_hook") {
		if e["decision"] == "deny" {
			denies = append(denies, e)
		}
	}
	if len(denies) != 1 {
		t.Fatalf("deny hook events %v in %v", denies, h.events)
	}
	return denies[0]
}

func hookLogDenies(t *testing.T, h *harness) []sentinel {
	t.Helper()
	var log sentinelLog
	recs, err := log.read(filepath.Join(h.task.Dir, "hook-log.jsonl"), mustPolicyNonce(t, h.task.Dir))
	if err != nil {
		t.Fatal(err)
	}
	var out []sentinel
	for _, r := range recs {
		if r.Decision == "deny" {
			out = append(out, r)
		}
	}
	return out
}

func TestHookDenyEventNamesProtectedPath(t *testing.T) {
	t.Parallel()
	h := denyRound(t, conformance.ProtectedPath)
	e := denyEvent(t, h)
	denies := hookLogDenies(t, h)
	if len(denies) != 1 || denies[0].Path == "" {
		t.Fatalf("hook log denies %+v", denies)
	}
	if e["reason"] != "this is a protected path ("+conformance.ProtectedPath+")" || e["path"] != denies[0].Path {
		t.Fatalf("event %v, record %+v", e, denies[0])
	}
}

func TestHookDenyEventOutsideCheckoutReason(t *testing.T) {
	t.Parallel()
	h := denyRound(t, "../outside.txt")
	e := denyEvent(t, h)
	if e["reason"] != "the path is outside the checkout" || e["reason"] == "PreToolUse:Write hook error: denied" {
		t.Fatalf("event %v", e)
	}
}

// unansweredDeny reports one pending Edit call whose sentinel is rec, at the round's result.
func unansweredDeny(t *testing.T, rec sentinel) map[string]any {
	t.Helper()
	root := t.TempDir()
	var events []map[string]any
	s := &session{a: &adapter{}, root: root, role: executor.RoleBuild, sessionID: "s", pol: policy{Log: filepath.Join(root, "hook.log"), Nonce: "n"}, emit: func(e map[string]any) { events = append(events, e) }}
	r := &roundRun{s: s, n: 2, init: true}
	if err := r.line([]byte(`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"deny","name":"Edit","input":{"file_path":"b.txt"}}]}}`)); err != nil {
		t.Fatal(err)
	}
	if err := appendSentinel(s.pol.Log, rec); err != nil {
		t.Fatal(err)
	}
	if err := r.line([]byte(`{"type":"result","subtype":"success","is_error":false,"session_id":"s","result":"done"}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := r.finish(0, false, ""); err != nil {
		t.Fatal(err)
	}
	var hooks []map[string]any
	for _, e := range events {
		if e["event"] == "executor_hook" {
			hooks = append(hooks, e)
		}
	}
	if len(hooks) != 1 || hooks[0]["decision"] != "deny" {
		t.Fatalf("events %v", events)
	}
	return hooks[0]
}

func TestHookDenyEventUnansweredCall(t *testing.T) {
	t.Parallel()
	e := unansweredDeny(t, sentinel{Nonce: "n", Hook: "pretool", ToolUseID: "deny", Decision: "deny", Path: "/repo/b.txt", Reason: "paths under .git are not editable"})
	if e["reason"] != "paths under .git are not editable" || e["path"] != "/repo/b.txt" {
		t.Fatalf("event %v", e)
	}
}

func TestHookDenyEventWithoutPathOmitsPath(t *testing.T) {
	t.Parallel()
	e := unansweredDeny(t, sentinel{Nonce: "n", Hook: "pretool", ToolUseID: "deny", Decision: "deny", Reason: "the tool call names no file path"})
	if _, has := e["path"]; has || e["reason"] != "the tool call names no file path" {
		t.Fatalf("event %v", e)
	}
}
