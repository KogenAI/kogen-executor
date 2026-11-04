package claudecode

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestRoundRateLimitTelemetry(t *testing.T) {
	for _, tc := range []struct{ name, value, want string }{
		{"127", strings.Repeat("a", 127), strings.Repeat("a", 127)},
		{"128", strings.Repeat("a", 128), strings.Repeat("a", 128)},
		{"129", strings.Repeat("a", 129), strings.Repeat("a", 128)},
		{"multibyte", strings.Repeat("a", 127) + "界", strings.Repeat("a", 127)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := &roundRun{init: true, result: map[string]any{"type": "result"}}
			b, _ := json.Marshal(map[string]any{"type": "rate_limit_event", "rate_limit_info": map[string]any{"status": tc.value, "rateLimitType": tc.value, "resetsAt": json.Number("1800000000.25"), "account": "PRIVATE", "utilization": 0.5}})
			if err := r.line(b); err != nil {
				t.Fatal(err)
			}
			if err := r.line([]byte(`{"type":"rate_limit_event"}`)); err != nil {
				t.Fatal(err)
			}
			got := map[string]any{}
			r.addRateLimit(got)
			want := map[string]any{"rate_limit_event_count": 2, "rate_limit_info": map[string]any{"status": tc.want, "rateLimitType": tc.want, "resetsAt": json.Number("1800000000.25")}}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("got %#v, want %#v", got, want)
			}
			if err := r.line([]byte(`{"type":"rate_limit_event","rate_limit_info":{"status":"rejected"}}`)); err != nil {
				t.Fatal(err)
			}
			got = map[string]any{}
			r.addRateLimit(got)
			want = map[string]any{"rate_limit_event_count": 3, "rate_limit_info": map[string]any{"status": "rejected"}}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("replacement got %#v, want %#v", got, want)
			}
		})
	}
	t.Run("empty and unusable", func(t *testing.T) {
		r := &roundRun{init: true}
		got := map[string]any{}
		r.addRateLimit(got)
		if len(got) != 0 {
			t.Fatalf("unexpected telemetry: %#v", got)
		}
		for _, line := range []string{`{"type":"rate_limit_event"}`, `{"type":"rate_limit_event","rate_limit_info":{"status":""}}`, `{"type":"rate_limit_event","rate_limit_info":{"status":4}}`} {
			if err := r.line([]byte(line)); err != nil {
				t.Fatal(err)
			}
		}
		got = map[string]any{}
		r.addRateLimit(got)
		if !reflect.DeepEqual(got, map[string]any{"rate_limit_event_count": 3}) {
			t.Fatalf("got %#v", got)
		}
	})
}
