package claudecode

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

func TestStreamPersistenceBoundariesAndReset(t *testing.T) {
	h := newHarness(t, fakeConfig{Script: conformance.Script{Rounds: []conformance.RoundScript{finishRound, finishRound}}})
	run := func(cap int64, rounds int) ([]string, []map[string]any) {
		h.events = nil
		o := h.f.options()
		o.StreamPersistBytes = cap
		s, err := h.start(o)
		if err != nil {
			t.Fatal(err)
		}
		defer s.Close()
		var files []string
		for i := 0; i < rounds; i++ {
			in := executor.Input{}
			if i > 0 {
				in.Feedback = "continue"
			}
			if _, err = s.Round(context.Background(), in); err != nil {
				t.Fatal(err)
			}
			b, e := os.ReadFile(filepath.Join(h.task.Dir, "round-"+string(rune('1'+i))+".jsonl"))
			if e != nil {
				t.Fatal(e)
			}
			files = append(files, string(b))
		}
		return files, append([]map[string]any(nil), h.eventsNamed("executor_round_ended")...)
	}
	baseline, _ := run(1<<20, 1)
	first := strings.IndexByte(baseline[0], '\n') + 1
	for _, delta := range []int{-1, 0, 1} {
		t.Run(string(rune('1'+delta)), func(t *testing.T) {
			cap := first + delta
			files, events := run(int64(cap), 2)
			for i, f := range files {
				lines := strings.SplitAfter(f, "\n")
				if delta < 0 && !strings.Contains(lines[0], "kogen_persistence_truncated") {
					t.Fatalf("oversized first line: %q", f)
				}
				if delta >= 0 && (len(lines) < 2 || !strings.Contains(lines[1], "kogen_persistence_truncated")) {
					t.Fatalf("expected first line and marker: %q", f)
				}
				if len(f) > cap+150 || events[i]["stream_persist_truncated"] != true {
					t.Fatalf("unbounded or absent event: %q %#v", f, events[i])
				}
			}
		})
	}
}

func TestPersistenceDoesNotBypassHook(t *testing.T) {
	h := newHarness(t, fakeConfig{SkipHook: true, Script: oneRound(conformance.RoundScript{Actions: []conformance.Action{{Write: &conformance.WriteAction{Path: "a.txt", Content: "a"}}}, End: "finish"})})
	o := h.f.options()
	o.StreamPersistBytes = 1
	s, err := h.start(o)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	_, err = s.Round(context.Background(), executor.Input{})
	e := wantError(t, err, "executor/protocol")
	if !strings.Contains(e.Detail, "hook did not run") {
		t.Fatal(e.Detail)
	}
	if h.eventsNamed("executor_round_failed")[0]["stream_persist_truncated"] != true {
		t.Fatal("missing truncation")
	}
}

func TestPersistenceDefaults(t *testing.T) {
	for _, n := range []int64{0, -1} {
		a := New(Options{StreamPersistBytes: n, StderrPersistBytes: n}).(*adapter)
		if a.opts.StreamPersistBytes != 64<<20 || a.opts.StderrPersistBytes != 8<<20 {
			t.Fatal(a.opts)
		}
	}
}
