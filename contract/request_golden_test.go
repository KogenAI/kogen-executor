package contract_test

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/KogenAI/kogen-executor/agent"
	"github.com/KogenAI/kogen-executor/internal/golden"
	"github.com/KogenAI/kogen-loop/provider"
)

// TestRequestBodies pins complete rendered generic-tool requests. Phase-owned tools are
// pinned by their owners, not agent.Defs. The paired consumer items are
// kogen cli/research_removal_test.go and cli/testdata/loop_knobs_golden.json.
func TestRequestBodies(t *testing.T) {
	const path = "testdata/loop_knobs_golden.json"
	const consumers = "kogen cli/research_removal_test.go and cli/testdata/loop_knobs_golden.json"
	roles := map[string]provider.Role{
		"chatgpt":           {Provider: "chatgpt", Model: "gpt-6.1-sol", Effort: "high"},
		"anthropic":         {Provider: "anthropic", Model: "claude-opus-5-5", Effort: "high"},
		"openai-compatible": {Provider: "openai-compatible", Model: "m", Effort: "default", BaseURL: "http://127.0.0.1:1/v1"},
	}
	got := make(map[string]string, len(roles))
	for name, role := range roles {
		req := provider.Request{
			Role: role, Instructions: "policy", CacheID: "fixed-cache-id",
			Input: []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "input_text", "text": "hi"}}}},
			Tools: agent.AsAny(agent.Defs("shell", "view_image", "read_file", "write_file", "list_files", "search_text", "documentation")),
		}
		body, err := provider.NewClient("").Render(req)
		if err != nil {
			t.Fatalf("%s render (%s): %v", name, consumers, err)
		}
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("%s serialize (%s): %v", name, consumers, err)
		}
		got[name] = string(encoded)
	}
	if golden.Update() {
		golden.WriteJSON(t, path, got)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden (%s): %v", consumers, err)
	}
	var want map[string]string
	if err := json.Unmarshal(data, &want); err != nil {
		t.Fatalf("decode golden (%s): %v", consumers, err)
	}
	if len(want) != len(got) {
		t.Errorf("request golden has %d bodies, want %d (%s)", len(want), len(got), consumers)
	}
	for name, body := range got {
		if expected, ok := want[name]; !ok || body != expected {
			t.Errorf("%s request body differs from golden (%s)\n got: %s\nwant: %s", name, consumers, body, expected)
		}
	}
}
