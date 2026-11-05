package claudecode

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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
	if err := redactor.Flush(); err != nil || file.err == nil || file.kept != 2 || string(sink.data) != "ab" || capped.lost != 2 {
		t.Fatalf("flush: %q %d %v %v %d", sink.data, file.kept, err, file.err, capped.lost)
	}
}

func TestStderrPersistenceCountsUnwrittenBytes(t *testing.T) {
	write := func(t *testing.T, p *stderrPersistence, in string, kept, lost int64) {
		t.Helper()
		n, err := p.Write([]byte(in))
		if n != len(in) || err != nil || p.kept != kept || p.lost != lost {
			t.Fatalf("write %q: n=%d err=%v kept=%d lost=%d", in, n, err, p.kept, p.lost)
		}
	}
	for _, short := range []bool{false, true} {
		p := &stderrPersistence{w: &partialSink{limit: 3, short: short}, cap: 100}
		write(t, p, "abcdef", 3, 3)
		write(t, p, "gh", 3, 5)
	}
	write(t, &stderrPersistence{w: &partialSink{limit: 2}, cap: 4}, "abcdef", 2, 4)
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
			// /dev/full makes the persistence write fail. Where it cannot be opened, a pipe
			// whose read end is already closed fails that write the same way.
			sink := "/dev/full"
			if f, err := os.OpenFile(sink, os.O_WRONLY, 0); err != nil {
				r, w, perr := os.Pipe()
				if perr != nil {
					t.Fatal(perr)
				}
				r.Close()
				t.Cleanup(func() { w.Close() })
				sink = fmt.Sprintf("/dev/fd/%d", w.Fd())
			} else {
				f.Close()
			}
			if err := os.Symlink(sink, filepath.Join(h.task.Dir, tc.artifact)); err != nil {
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

// A stderr artifact that refuses every write still drains the child and counts every byte.
func TestStderrWriteFailureCountsEveryByte(t *testing.T) {
	full, err := os.OpenFile("/dev/full", os.O_WRONLY, 0)
	if err != nil {
		t.Skipf("/dev/full is not writable on this platform: %v", err)
	}
	full.Close()
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
	s, err := h.start(h.f.options())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ss := s.(*session)
	wrapper := filepath.Join(t.TempDir(), "wrapper")
	script := "#!/bin/sh\nhead -c 1048576 /dev/zero >&2\nexec '" + ss.bin + "' \"$@\"\n"
	if err := os.WriteFile(wrapper, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	ss.bin = wrapper
	if err := os.Symlink("/dev/full", filepath.Join(h.task.Dir, "round-1.stderr")); err != nil {
		t.Fatal(err)
	}
	_, err = s.Round(context.Background(), executor.Input{})
	e := wantError(t, err, "executor/failed")
	if e.Detail != "cannot persist round-1.stderr after 0 bytes" {
		t.Fatal(e.Detail)
	}
	ev := h.eventsNamed("executor_round_failed")
	if len(ev) != 1 || ev[0]["artifact"] != "round-1.stderr" || ev[0]["kept_bytes"] != int64(0) ||
		ev[0]["stderr_persist_truncated"] != true || ev[0]["stderr_persist_unpersisted_bytes"] != int64(1048576) {
		t.Fatalf("events %v", h.events)
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

// A round's own failure survives a later persistence failure; only a round that would
// otherwise have succeeded is failed by the artifact, which the event still names.
func TestRoundFailureOutranksPersistenceFailure(t *testing.T) {
	full, err := os.OpenFile("/dev/full", os.O_WRONLY, 0)
	if err != nil {
		t.Skipf("/dev/full is not writable on this platform: %v", err)
	}
	full.Close()
	sleeping := conformance.RoundScript{Actions: []conformance.Action{{Shell: "sleep 30"}}, End: "finish"}
	for _, tc := range []struct {
		name, role, want, detail string
		cfg                      fakeConfig
		ctx                      func() (context.Context, context.CancelFunc)
	}{
		{"deadline", executor.RoleBuild, "executor/deadline", "the Build deadline passed; Claude Code and its processes were stopped",
			fakeConfig{Script: oneRound(sleeping), Init: tokenInitEvent, Auth: goodAuth},
			func() (context.Context, context.CancelFunc) {
				return context.WithTimeout(context.Background(), 500*time.Millisecond)
			}},
		{"interrupted", executor.RoleBuild, "executor/interrupted", "the round was interrupted; Claude Code and its processes were stopped",
			fakeConfig{Script: oneRound(sleeping), Init: tokenInitEvent, Auth: goodAuth},
			func() (context.Context, context.CancelFunc) {
				ctx, cancel := context.WithCancel(context.Background())
				time.AfterFunc(500*time.Millisecond, cancel)
				return ctx, cancel
			}},
		{"protocol", executor.RoleBuild, "executor/protocol", `Claude Code reports permission mode "default", not acceptEdits`,
			fakeConfig{Script: oneRound(finishRound), Init: map[string]any{"permissionMode": "default"}, Auth: goodAuth}, nil},
		{"usage limit", executor.RoleBuild, "executor/usage_limit", `Claude Code reported an error result: subtype "success", terminal reason "api_error"`,
			fakeConfig{Script: oneRound(finishRound), Init: tokenInitEvent, Auth: goodAuth, AssistantError: "rate_limit",
				Result: map[string]any{"is_error": true, "terminal_reason": "api_error"}}, nil},
		{"schema", executor.RoleReview, "executor/protocol", "the final success result of the review role has no structured_output object",
			fakeConfig{Script: oneRound(finishRound), Init: tokenInitEvent, Auth: goodAuth}, nil},
		{"success", executor.RoleBuild, "executor/failed", "cannot persist round-1.stderr after 0 bytes",
			fakeConfig{Script: oneRound(finishRound), Init: tokenInitEvent, Auth: goodAuth}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := roleHarness(t, tc.role, tc.cfg)
			o := h.f.options()
			o.Token = "a-long-synthetic-token-for-the-buffer"
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
			if err := os.Symlink("/dev/full", filepath.Join(h.task.Dir, "round-1.stderr")); err != nil {
				t.Fatal(err)
			}
			ctx := context.Background()
			if tc.ctx != nil {
				var cancel context.CancelFunc
				ctx, cancel = tc.ctx()
				defer cancel()
			}
			_, err = s.Round(ctx, executor.Input{})
			e := wantError(t, err, tc.want)
			if e.Detail != tc.detail {
				t.Fatalf("detail %q", e.Detail)
			}
			ev := h.eventsNamed("executor_round_failed")
			reason := strings.TrimPrefix(tc.want, "executor/")
			if len(ev) != 1 || ev[0]["reason"] != reason || ev[0]["detail"] != tc.detail || ev[0]["artifact"] != "round-1.stderr" ||
				ev[0]["kept_bytes"] != int64(0) || len(h.eventsNamed("executor_round_ended")) != 0 {
				t.Fatalf("events %v", h.events)
			}
			_, err = s.Round(context.Background(), executor.Input{Feedback: "again"})
			if err == nil {
				t.Fatal("the session accepted a round after the failure")
			}
		})
	}
}
