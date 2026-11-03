package claudecode

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestResultTelemetry(t *testing.T) {
	cases := []struct {
		content      string
		bytes, items int
	}{
		{`"é\n"`, 3, 1}, {`""`, 0, 1}, {`[]`, 0, 0}, {`null`, 0, 0}, {`42`, 0, 0},
		{`[{"type":"image","source":{"data":"secret"}}]`, 0, 1},
		{`[{"type":"text","text":"é€"},{"type":"text","text":2},{"type":"image"},{"type":"text","text":"boom"}]`, 9, 4},
	}
	for _, tc := range cases {
		var content any
		if err := json.Unmarshal([]byte(tc.content), &content); err != nil {
			t.Fatal(err)
		}
		b, n := resultSize(content)
		if b != tc.bytes || n != tc.items {
			t.Errorf("%s: got %d bytes %d items", tc.content, b, n)
		}
	}
}

func TestResultTelemetryBeforeRedaction(t *testing.T) {
	var events []map[string]any
	r := &roundRun{n: 1, init: true, s: &session{emit: func(e map[string]any) { events = append(events, e) }}}
	if err := r.line([]byte(`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read"}]}}`)); err != nil {
		t.Fatal(err)
	}
	secret := "sk-" + strings.Repeat("a", 20)
	raw, _ := json.Marshal(map[string]any{"type": "user", "message": map[string]any{"content": []any{map[string]any{"type": "tool_result", "tool_use_id": "t1", "content": secret, "is_error": true}}}})
	redacted := []byte(strings.ReplaceAll(string(raw), secret, "[redacted]"))
	if err := r.lineReceived(redacted, raw); err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0]["result_bytes"] != len(secret) || events[0]["result_items"] != 1 || events[0]["result_error"] != true {
		t.Fatalf("events: %v", events)
	}
	out, _ := json.Marshal(events)
	if strings.Contains(string(out), secret) {
		t.Fatalf("leaked: %s", out)
	}
}
