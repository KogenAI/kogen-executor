package loop_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-loop/tools"
)

func TestProviderConsumption(t *testing.T) {
	if provider.ResponseBudget != 30*time.Minute {
		t.Fatal("agent/budget.go default")
	}
	c := provider.Client{ResponseBudget: 10 * time.Minute}
	if c.ResponseBudget != 10*time.Minute {
		t.Fatal("agent/budget.go override")
	}
	r := provider.Role{Provider: "anthropic", Model: "m", Effort: "e", BaseURL: "u"}
	if r.Provider != "anthropic" || r.Model != "m" || r.Effort != "e" || r.BaseURL != "u" {
		t.Fatal("core/state.go provider role routing")
	}
	n := 7
	resp := provider.Response{Usage: provider.Usage{Input: 1, Cached: 2, Output: 3, Reasoning: 4}, Known: provider.KnownUsage{Input: &n, Output: &n}}
	if resp.Usage != (provider.Usage{Input: 1, Cached: 2, Output: 3, Reasoning: 4}) || *resp.Known.Input != 7 || *resp.Known.Output != 7 || resp.Known.Cached != nil || resp.Known.Reasoning != nil {
		t.Fatal("core/state.go response usage")
	}
}
func TestSysConsumption(t *testing.T) {
	e := sys.Fail("candidate", "reason", "detail", 1)
	e.Lines = []string{"line"}
	if e.Class != "candidate" || e.Reason != "reason" || e.Detail != "detail" || e.Exit != 1 || e.Error() != "candidate/reason: detail" || !reflect.DeepEqual(e.Lines, []string{"line"}) {
		t.Fatal("agent/origin_hint.go sys.Error; core/util.go Fail")
	}
	if got, ok := sys.AsError(fmt.Errorf("wrapped: %w", e)); !ok || got != e {
		t.Fatal("session.go AsError wrapped")
	}
	if _, ok := sys.AsError(errors.New("other")); ok {
		t.Fatal("conformance.go AsError nonrecognition")
	}
	for _, sig := range []string{"SIGINT", "SIGTERM", "SIGHUP"} {
		cause := &sys.Interrupted{Signal: sig}
		ctx, cancel := context.WithCancelCause(context.Background())
		cancel(cause)
		var got *sys.Interrupted
		if !errors.As(context.Cause(ctx), &got) || got.Signal != sig || got.Error() != "interrupted by "+sig {
			t.Fatal("session.go Interrupted", sig)
		}
	}
}

type fakeGit struct{}

func (fakeGit) Run(...string) (tools.GitResult, error) {
	return tools.GitResult{Stdout: "out", Stderr: "err", Status: 4}, nil
}
func (fakeGit) Head() string                          { return "head" }
func (fakeGit) Tree(string, []string) (string, error) { return "tree", nil }
func TestToolsConsumption(t *testing.T) {
	var g tools.Git = fakeGit{}
	r, e := g.Run("x")
	if e != nil || r.Stdout != "out" || r.Stderr != "err" || r.Status != 4 || g.Head() != "head" {
		t.Fatal("agent/git.go tools.Git")
	}
	if tree, _ := g.Tree("head", nil); tree != "tree" {
		t.Fatal("agent/git.go Tree")
	}
	cases := []struct {
		name  string
		props map[string]string
		req   []any
	}{{"shell", map[string]string{"command": "string", "handle": "string"}, []any{}}, {"view_image", map[string]string{"path": "string"}, []any{"path"}}, {"read_file", map[string]string{"path": "string", "start_line": "integer", "end_line": "integer"}, []any{"path"}}, {"write_file", map[string]string{"path": "string", "content": "string"}, []any{"path", "content"}}, {"list_files", map[string]string{"path": "string"}, []any{}}, {"search_text", map[string]string{"pattern": "string", "path": "string"}, []any{"pattern"}}, {"documentation", map[string]string{"operation": "string", "query": "string", "url": "string", "offset": "integer", "find": "string", "base": "string"}, []any{"operation"}}}
	for _, tc := range cases {
		d, ok := tools.Definition(tc.name)
		if !ok || d["type"] != "function" || d["name"] != tc.name || d["strict"] != false || d["description"] == "" {
			t.Fatalf("agent/defs.go definition %s: %v", tc.name, d)
		}
		p := d["parameters"].(map[string]any)
		props := p["properties"].(map[string]any)
		if p["type"] != "object" || p["additionalProperties"] != false || !reflect.DeepEqual(p["required"], tc.req) || len(props) != len(tc.props) {
			t.Fatalf("agent/defs.go schema %s: %v", tc.name, p)
		}
		for name, typ := range tc.props {
			if props[name].(map[string]any)["type"] != typ {
				t.Fatalf("agent/defs.go %s.%s", tc.name, name)
			}
		}
	}
	if d, ok := tools.Definition("unknown"); ok || d != nil {
		t.Fatal("agent/defs.go unknown")
	}
	a := map[string]any{"name": "a"}
	b := map[string]any{"name": "b"}
	if !reflect.DeepEqual(tools.AsAny(nil, []map[string]any{a}, nil, []map[string]any{b}), []any{a, b}) {
		t.Fatal("agent/defs.go AsAny order")
	}
	shell, _ := tools.Definition("shell")
	var ts tools.Tools
	actual, ok := ts.Definition("shell")
	if !ok || !reflect.DeepEqual(actual, shell) {
		t.Fatal("core/util.go Tools.Definition")
	}
}
