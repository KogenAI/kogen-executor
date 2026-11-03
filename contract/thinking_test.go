package contract_test

import (
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-executor/thinking"
)

func TestThinkingStrip(t *testing.T) {
	t.Parallel()
	const src = "(kogen-build k18_binding_test.go context.go; kogen-shaping shape/window.go)"
	text := map[string]any{"type": "text", "text": "hi"}
	use := map[string]any{"type": "tool_use", "id": "t1", "name": "read_file", "input": map[string]any{"path": "a"}}
	mixed := map[string]any{"type": "message", "role": "assistant", "content": "c",
		"anthropic_message": map[string]any{"role": "assistant", "content": []any{
			map[string]any{"type": "thinking", "thinking": "p", "signature": "s"},
			text,
			map[string]any{"type": "redacted_thinking", "data": "d"},
			use,
		}}}
	for _, kind := range []string{"thinking", "redacted_thinking"} {
		t.Run("only "+kind, func(t *testing.T) {
			t.Parallel()
			only := map[string]any{"type": "message", "role": "assistant", "content": "x",
				"anthropic_message": map[string]any{"role": "assistant", "content": []any{map[string]any{"type": kind, "data": "d"}}}}
			got := thinking.Strip([]any{only})[0].(map[string]any)
			if _, has := got["anthropic_message"]; has {
				t.Errorf("a message left without blocks keeps anthropic_message (only %s) %s: %v", kind, src, got)
			}
			eq(t, "a message left without blocks keeps its plain content (only "+kind+") "+src, got["content"], any("x"))
		})
	}
	plain := map[string]any{"role": "user", "content": "u"}
	call := map[string]any{"type": "function_call", "call_id": "t1", "name": "read_file", "arguments": "{}"}
	items := []any{plain, mixed, call}
	before := mustJSON(t, items)

	got := thinking.Strip(items)
	eq(t, "thinking.Strip does not mutate its input "+src, mustJSON(t, items), before)
	if len(got) != 3 || !reflect.DeepEqual(got[0], plain) || !reflect.DeepEqual(got[2], call) {
		t.Fatalf("thinking.Strip changes other items %s: %s", src, mustJSON(t, got))
	}
	blocks := got[1].(map[string]any)["anthropic_message"].(map[string]any)["content"].([]any)
	eq(t, "thinking.Strip removes thinking and redacted_thinking blocks and keeps the others "+src, mustJSON(t, blocks), mustJSON(t, []any{text, use}))
}
