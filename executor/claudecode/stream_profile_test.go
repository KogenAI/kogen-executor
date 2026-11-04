package claudecode

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"
)

func profileLine(t *testing.T, r *roundRun, typ, sub string) {
	t.Helper()
	ev := map[string]any{"type": typ}
	if sub != "" {
		ev["subtype"] = sub
	}
	b, _ := json.Marshal(ev)
	if err := r.line(b); err != nil {
		t.Fatalf("%s/%s: %v", typ, sub, err)
	}
}

func TestIgnoredEventKeys(t *testing.T) {
	r := &roundRun{init: true}
	a := strings.Repeat("a", 64-len("system/"))
	for _, sub := range []string{a, a + "b", strings.Repeat("a", 200)} {
		profileLine(t, r, "system", sub)
	}
	// "system/" is 7 bytes; 28 two-byte runes end at byte 63, so the 64-byte cut lands inside a rune.
	e := strings.Repeat("é", 29)
	profileLine(t, r, "system", e)
	profileLine(t, r, "progress_tick", "")
	for _, startup := range []string{"hook_started", "hook_response", "plugin_install"} {
		profileLine(t, r, "system", startup)
	}
	for _, typ := range []string{"assistant", "user", "rate_limit_event"} {
		profileLine(t, r, typ, "whatever")
	}
	want := map[string]int{"system/" + a: 3, "system/" + strings.Repeat("é", 28): 1, "progress_tick": 1}
	if !reflect.DeepEqual(r.ignored, want) {
		t.Fatalf("got %v, want %v", r.ignored, want)
	}
}

func TestIgnoredEventKeyBytes(t *testing.T) {
	for _, n := range []int{63, 64, 65} {
		r := &roundRun{init: true}
		profileLine(t, r, strings.Repeat("x", n), "")
		for k := range r.ignored {
			if len(k) != min(n, 64) {
				t.Fatalf("%d-byte key kept as %d bytes", n, len(k))
			}
		}
	}
}

func TestIgnoredEventKeyBound(t *testing.T) {
	r := &roundRun{init: true}
	for i := 1; i <= 17; i++ {
		profileLine(t, r, "system", fmt.Sprintf("n%02d", i))
	}
	profileLine(t, r, "system", "n01")
	if len(r.ignored) != 16 || r.ignored["system/n16"] != 1 || r.ignored["system/n17"] != 0 || r.ignored["system/n01"] != 2 {
		t.Fatalf("got %v", r.ignored)
	}
	ev := map[string]any{}
	r.addProfile(ev)
	if _, ok := ev["ignored_events"]; !ok {
		t.Fatal("ignored_events missing")
	}
	empty := map[string]any{}
	(&roundRun{}).addProfile(empty)
	if _, ok := empty["ignored_events"]; ok {
		t.Fatal("empty ignored_events must be omitted")
	}
	if _, ok := empty["init_ms"]; ok {
		t.Fatal("init_ms must be omitted without init")
	}
}

func TestLineGap(t *testing.T) {
	r := &roundRun{}
	t0 := time.Now()
	r.receive(t0.Add(5 * time.Second)) // the wait before the first line is not a gap
	if r.maxGap != 0 {
		t.Fatalf("gap %v", r.maxGap)
	}
	r.receive(t0.Add(6 * time.Second))
	r.receive(t0.Add(11 * time.Second))
	r.receive(t0.Add(12 * time.Second))
	if r.maxGap != 5*time.Second {
		t.Fatalf("gap %v", r.maxGap)
	}
}

func TestEventsAfterResultCount(t *testing.T) {
	for _, tc := range []struct{ before, after int }{{0, 1}, {2147483646, 2147483647}, {2147483647, 2147483647}} {
		r := &roundRun{init: true, result: map[string]any{"type": "result"}, eventsAfterResult: tc.before}
		profileLine(t, r, "system", "hook_started")
		if r.eventsAfterResult != tc.after {
			t.Fatalf("count %d, want %d", r.eventsAfterResult, tc.after)
		}
		if err := r.line([]byte(`{"type":"user"}`)); err == nil {
			t.Fatal("accepted user")
		}
		event := map[string]any{}
		r.addProfile(event)
		if event["events_after_result"] != tc.after {
			t.Fatalf("profile %v", event)
		}
	}
	event := map[string]any{}
	(&roundRun{}).addProfile(event)
	if _, ok := event["events_after_result"]; ok {
		t.Fatalf("zero count: %v", event)
	}
}
