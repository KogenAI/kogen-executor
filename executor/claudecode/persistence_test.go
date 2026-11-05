package claudecode

import (
	"bytes"
	"context"
	"io"
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

type partialSink struct {
	limit int
	data  []byte
	short bool
}

func (s *partialSink) Write(b []byte) (int, error) {
	n := min(len(b), s.limit-len(s.data))
	s.data = append(s.data, b[:n]...)
	if n < len(b) && !s.short {
		return n, io.ErrClosedPipe
	}
	return n, nil
}

func TestRetainedWritesAndRedactorFlush(t *testing.T) {
	for _, short := range []bool{false, true} {
		sink := &partialSink{limit: 3, short: short}
		w := &retainedWriter{w: sink}
		_, err := w.Write([]byte("abcdef"))
		if err == nil || w.kept != 3 || string(sink.data) != "abc" {
			t.Fatalf("partial: %q %d %v", sink.data, w.kept, err)
		}
	}
	sink := &partialSink{limit: 2}
	file := &retainedWriter{w: sink}
	capped := &stderrPersistence{w: file, cap: 100}
	redactor := newRedactWriter(capped, "secret", "[redacted]")
	if _, err := redactor.Write([]byte("abcd")); err != nil {
		t.Fatal(err)
	}
	if err := redactor.Flush(); err == nil || file.kept != 2 || string(sink.data) != "ab" {
		t.Fatalf("flush: %q %d %v", sink.data, file.kept, err)
	}
}

func TestRetainedRedactionBytes(t *testing.T) {
	var out bytes.Buffer
	file := &retainedWriter{w: &out}
	capped := &stderrPersistence{w: file, cap: 1000}
	redactor := newRedactWriter(capped, "secret", "[redacted]")
	for _, part := range []string{"before sec", "ret after"} {
		if _, err := redactor.Write([]byte(part)); err != nil {
			t.Fatal(err)
		}
	}
	if err := redactor.Flush(); err != nil {
		t.Fatal(err)
	}
	if out.String() != "before [redacted] after" || file.kept != int64(out.Len()) {
		t.Fatalf("%q %d", out.String(), file.kept)
	}
}

// A failure discovered only while finalizing still replaces the successful result.
func TestFinalPersistenceFailures(t *testing.T) {
	// The failing artifact is a symlink to /dev/full, which only some platforms provide.
	full, err := os.OpenFile("/dev/full", os.O_WRONLY, 0)
	if err != nil {
		t.Skipf("/dev/full is not writable on this platform: %v", err)
	}
	full.Close()
	for _, tc := range []struct {
		name, artifact string
		marker         bool
	}{
		{"stderr flush", "round-1.stderr", false},
		{"stream marker", "round-1.jsonl", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Init: tokenInitEvent, Auth: goodAuth})
			o := h.f.options()
			o.Token = "a-long-synthetic-token-for-the-buffer"
			if tc.marker {
				o.StreamPersistBytes = 1
			}
			s, err := h.start(o)
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			ss := s.(*session)
			wrapper := filepath.Join(t.TempDir(), "wrapper")
			script := "#!/bin/sh\nprintf x >&2\nexec '" + ss.bin + "' \"$@\"\n"
			if err := os.WriteFile(wrapper, []byte(script), 0700); err != nil {
				t.Fatal(err)
			}
			ss.bin = wrapper
			if err := os.Symlink("/dev/full", filepath.Join(h.task.Dir, tc.artifact)); err != nil {
				t.Fatal(err)
			}
			_, err = s.Round(context.Background(), executor.Input{})
			e := wantError(t, err, "executor/failed")
			if e.Detail != "cannot persist "+tc.artifact+" after 0 bytes" {
				t.Fatal(e.Detail)
			}
			ev := h.eventsNamed("executor_round_failed")
			if len(ev) != 1 || ev[0]["artifact"] != tc.artifact || ev[0]["kept_bytes"] != int64(0) || len(h.eventsNamed("executor_round_ended")) != 0 {
				t.Fatalf("events %v", h.events)
			}
		})
	}
}

func TestSuccessfulStderrEvidenceBytes(t *testing.T) {
	const token = "synthetic-secret"
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Init: tokenInitEvent, Auth: goodAuth, Result: map[string]any{"result": "before " + token + " after"}})
	o := h.f.options()
	o.Token = token
	s, err := h.start(o)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ss := s.(*session)
	wrapper := filepath.Join(t.TempDir(), "wrapper")
	script := "#!/bin/sh\nprintf 'before synthetic-secret after' >&2\nexec '" + ss.bin + "' \"$@\"\n"
	if err := os.WriteFile(wrapper, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	ss.bin = wrapper
	if _, err := s.Round(context.Background(), executor.Input{}); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(h.task.Dir, "round-1.stderr"))
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != "before "+redactMark+" after" {
		t.Fatalf("stderr %q", b)
	}
	b, err = os.ReadFile(filepath.Join(h.task.Dir, "round-1.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), token) || !strings.Contains(string(b), "before "+redactMark+" after") {
		t.Fatalf("stream %q", b)
	}
}
