package claudecode

import (
	"bytes"
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

const (
	tsA = "11111111-1111-4111-8111-111111111111"
	tsB = "22222222-2222-4222-8222-222222222222"
	tsC = "33333333-3333-4333-8333-333333333333"
)

func putTranscript(t *testing.T, path string, size int, age time.Duration) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, bytes.Repeat([]byte("x"), size), 0o644); err != nil {
		t.Fatal(err)
	}
	mt := time.Now().Add(-age)
	if err := os.Chtimes(path, mt, mt); err != nil {
		t.Fatal(err)
	}
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

func TestPruneTranscriptsAgeBoundary(t *testing.T) {
	cfg := t.TempDir()
	now := time.Now()
	dir := filepath.Join(cfg, "projects", "-w")
	exact, older := filepath.Join(dir, tsA+".jsonl"), filepath.Join(dir, tsB+".jsonl")
	putTranscript(t, exact, 10, 0)
	putTranscript(t, older, 20, 0)
	retention := 24 * time.Hour
	for p, age := range map[string]time.Duration{exact: retention, older: retention + time.Second} {
		mt := now.Add(-age)
		if err := os.Chtimes(p, mt, mt); err != nil {
			t.Fatal(err)
		}
	}
	rep := pruneTranscripts(cfg, now, retention, "none")
	if rep.removed != 1 || rep.removedBytes != 20 || rep.kept != 1 || rep.removeFailed != 0 || rep.boundReached {
		t.Fatalf("report %+v", rep)
	}
	if !exists(exact) || exists(older) {
		t.Fatalf("exact kept=%v older kept=%v", exists(exact), exists(older))
	}
}

func TestPruneTranscriptsLeavesOthersAlone(t *testing.T) {
	cfg := t.TempDir()
	old := 90 * time.Hour
	outside := filepath.Join(t.TempDir(), "outside")
	putTranscript(t, filepath.Join(outside, "target.jsonl"), 5, old)
	putTranscript(t, filepath.Join(outside, "workdir", tsC+".jsonl"), 5, old)
	proj := filepath.Join(cfg, "projects")
	putTranscript(t, filepath.Join(proj, "-w", "notes.jsonl"), 5, old)
	putTranscript(t, filepath.Join(proj, "-w", "sub", tsA+".jsonl"), 5, old)
	putTranscript(t, filepath.Join(proj, "-w", tsB+".jsonl"), 7, old)
	putTranscript(t, filepath.Join(proj, "-w", "UPPER"+tsA[5:]+".jsonl"), 5, old)
	putTranscript(t, filepath.Join(proj, tsA+".jsonl"), 5, old)
	putTranscript(t, filepath.Join(cfg, "plugins", tsA+".jsonl"), 5, old)
	putTranscript(t, filepath.Join(cfg, "settings.json"), 5, old)
	if err := os.Symlink(filepath.Join(outside, "target.jsonl"), filepath.Join(proj, "-w", tsA+".jsonl")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "workdir"), filepath.Join(proj, "-linked")); err != nil {
		t.Fatal(err)
	}
	rep := pruneTranscripts(cfg, time.Now(), 24*time.Hour, "none")
	if rep.removed != 1 || rep.removedBytes != 7 || rep.kept != 0 || rep.removeFailed != 0 || rep.boundReached {
		t.Fatalf("report %+v", rep)
	}
	for _, p := range []string{
		filepath.Join(outside, "target.jsonl"), filepath.Join(outside, "workdir", tsC+".jsonl"),
		filepath.Join(proj, "-w", "notes.jsonl"), filepath.Join(proj, "-w", "sub", tsA+".jsonl"),
		filepath.Join(proj, "-w", tsA+".jsonl"), filepath.Join(proj, "-linked"),
		filepath.Join(proj, tsA+".jsonl"), filepath.Join(cfg, "plugins", tsA+".jsonl"),
		filepath.Join(cfg, "settings.json"),
	} {
		if !exists(p) {
			t.Errorf("%s was removed", p)
		}
	}
	if exists(filepath.Join(proj, "-w", tsB+".jsonl")) {
		t.Error("the plain old transcript was kept")
	}
}

func TestPruneTranscriptsSymlinkedProjects(t *testing.T) {
	cfg := t.TempDir()
	real := filepath.Join(t.TempDir(), "real")
	target := filepath.Join(real, "-w", tsA+".jsonl")
	putTranscript(t, target, 5, 90*time.Hour)
	if err := os.Symlink(real, filepath.Join(cfg, "projects")); err != nil {
		t.Fatal(err)
	}
	if rep := pruneTranscripts(cfg, time.Now(), 24*time.Hour, "none"); rep != (transcriptReport{}) || !exists(target) {
		t.Fatalf("report %+v, target kept=%v", rep, exists(target))
	}
}

func TestPruneTranscriptsSymlinkedConfig(t *testing.T) {
	real := t.TempDir()
	target := filepath.Join(real, "projects", "-w", tsA+".jsonl")
	putTranscript(t, target, 5, 90*time.Hour)
	cfg := filepath.Join(t.TempDir(), "config")
	if err := os.Symlink(real, cfg); err != nil {
		t.Fatal(err)
	}
	if rep := pruneTranscripts(cfg, time.Now(), 24*time.Hour, "none"); rep.removed != 1 || exists(target) {
		t.Fatalf("report %+v, target kept=%v", rep, exists(target))
	}
}

func TestPruneTranscriptsBound(t *testing.T) {
	for _, tc := range []struct {
		files, removed, remain int
		bound                  bool
	}{
		{9998, 9998, 0, false},
		{10050, 9999, 51, true},
	} {
		t.Run(fmt.Sprint(tc.files), func(t *testing.T) {
			cfg := t.TempDir()
			dir := filepath.Join(cfg, "projects", "-bulk")
			if err := os.MkdirAll(dir, 0o755); err != nil {
				t.Fatal(err)
			}
			mt := time.Now().Add(-30 * time.Hour)
			for i := 0; i < tc.files; i++ {
				p := filepath.Join(dir, fmt.Sprintf("%08x-0000-4000-8000-000000000000.jsonl", i))
				if err := os.WriteFile(p, []byte("0123456789"), 0o644); err != nil {
					t.Fatal(err)
				}
				if err := os.Chtimes(p, mt, mt); err != nil {
					t.Fatal(err)
				}
			}
			rep := pruneTranscripts(cfg, time.Now(), 24*time.Hour, "none")
			want := transcriptReport{removed: int64(tc.removed), removedBytes: int64(tc.removed) * 10, boundReached: tc.bound}
			if rep != want {
				t.Fatalf("report %+v, want %+v", rep, want)
			}
			left, _ := os.ReadDir(dir)
			if len(left) != tc.remain {
				t.Fatalf("%d entries remain, want %d", len(left), tc.remain)
			}
		})
	}
}

func TestPruneTranscriptsRemoveFailure(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permissions")
	}
	cfg := t.TempDir()
	proj := filepath.Join(cfg, "projects")
	locked := filepath.Join(proj, "-locked", tsA+".jsonl")
	putTranscript(t, locked, 5, 90*time.Hour)
	putTranscript(t, filepath.Join(proj, "-w", tsB+".jsonl"), 9, 90*time.Hour)
	if err := os.Chmod(filepath.Dir(locked), 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(filepath.Dir(locked), 0o755) })
	rep := pruneTranscripts(cfg, time.Now(), 24*time.Hour, "none")
	if rep.removed != 1 || rep.removedBytes != 9 || rep.removeFailed != 1 || !exists(locked) {
		t.Fatalf("report %+v, locked kept=%v", rep, exists(locked))
	}
}

func startEventTranscripts(t *testing.T, h *harness) (map[string]any, bool) {
	t.Helper()
	ev := h.eventsNamed("executor_started")
	if len(ev) != 1 {
		t.Fatalf("%d executor_started events", len(ev))
	}
	v, ok := ev[0]["transcripts"]
	if !ok {
		return nil, false
	}
	m, ok := v.(map[string]any)
	if !ok {
		t.Fatalf("transcripts is %T", v)
	}
	return m, true
}

func TestStartPrunesTranscripts(t *testing.T) {
	setup := func(t *testing.T) (*harness, string, string, string) {
		h := newHarness(t, fakeConfig{})
		proj := filepath.Join(ConfigDir(h.f.options().Home), "projects", "-w")
		recent, old, older := filepath.Join(proj, tsA+".jsonl"), filepath.Join(proj, tsB+".jsonl"), filepath.Join(proj, tsC+".jsonl")
		putTranscript(t, recent, 100, 2*time.Hour)
		putTranscript(t, old, 300, 30*time.Hour)
		putTranscript(t, older, 4000, 90*time.Hour)
		return h, recent, old, older
	}
	start := func(t *testing.T, h *harness, retention *time.Duration) {
		opts := h.f.options()
		opts.TranscriptRetention = retention
		s, err := h.start(opts)
		if err != nil {
			t.Fatalf("Start: %v", err)
		}
		t.Cleanup(func() { s.Close() })
	}
	hours := func(n int) *time.Duration { d := time.Duration(n) * time.Hour; return &d }

	t.Run("default is 24 hours", func(t *testing.T) {
		h, recent, old, older := setup(t)
		start(t, h, nil)
		got, ok := startEventTranscripts(t, h)
		want := map[string]any{"removed": int64(2), "removed_bytes": int64(4300), "kept": int64(1), "remove_failed": int64(0), "bound_reached": false}
		if !ok || !reflect.DeepEqual(got, want) {
			t.Fatalf("transcripts %v, want %v", got, want)
		}
		if !exists(recent) || exists(old) || exists(older) {
			t.Fatalf("recent=%v old=%v older=%v", exists(recent), exists(old), exists(older))
		}
	})
	t.Run("option sets the period", func(t *testing.T) {
		h, recent, old, older := setup(t)
		start(t, h, hours(48))
		got, _ := startEventTranscripts(t, h)
		if got["removed"] != int64(1) || got["kept"] != int64(2) || !exists(recent) || !exists(old) || exists(older) {
			t.Fatalf("transcripts %v", got)
		}
	})
	for _, n := range []int{0, -1} {
		t.Run(fmt.Sprintf("%d disables", n), func(t *testing.T) {
			h, recent, old, older := setup(t)
			start(t, h, hours(n))
			if got, ok := startEventTranscripts(t, h); ok {
				t.Fatalf("transcripts %v", got)
			}
			if !exists(recent) || !exists(old) || !exists(older) {
				t.Fatal("a transcript was removed")
			}
		})
	}
	t.Run("nothing to report adds no key", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		start(t, h, nil)
		if got, ok := startEventTranscripts(t, h); ok {
			t.Fatalf("transcripts %v", got)
		}
	})
	t.Run("own transcript is skipped", func(t *testing.T) {
		saved := rand.Reader
		rand.Reader = zeroReader{}
		defer func() { rand.Reader = saved }()
		h := newHarness(t, fakeConfig{})
		proj := filepath.Join(ConfigDir(h.f.options().Home), "projects", "-w")
		own := filepath.Join(proj, "00000000-0000-4000-8000-000000000000.jsonl")
		other := filepath.Join(proj, tsA+".jsonl")
		putTranscript(t, own, 150, 90*time.Hour)
		putTranscript(t, other, 250, 90*time.Hour)
		start(t, h, nil)
		got, _ := startEventTranscripts(t, h)
		if got["removed"] != int64(1) || got["removed_bytes"] != int64(250) || got["kept"] != int64(0) || !exists(own) || exists(other) {
			t.Fatalf("transcripts %v", got)
		}
	})
	t.Run("failed Start prunes nothing", func(t *testing.T) {
		h, recent, old, older := setup(t)
		h.task.Dir = ""
		opts := h.f.options()
		if _, err := h.start(opts); err == nil {
			t.Fatal("Start succeeded")
		}
		if !exists(recent) || !exists(old) || !exists(older) {
			t.Fatal("a transcript was removed")
		}
	})
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) { clear(p); return len(p), nil }
