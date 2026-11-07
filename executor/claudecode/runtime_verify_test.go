package claudecode

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestOwnerModeProblem(t *testing.T) {
	for _, c := range []struct {
		name         string
		owner        uint32
		mode         os.FileMode
		wantContains string
	}{
		{"0755", 1000, 0o755, ""},
		{"0555", 1000, 0o555, ""},
		{"0700", 1000, 0o700, ""},
		{"0775", 1000, 0o775, "writable by group"},
		{"0757", 1000, 0o757, "writable by others"},
		{"0777", 1000, 0o777, "writable by group"},
		{"foreign owner", 1001, 0o755, "owned by another user"},
	} {
		if got := ownerModeProblem(1000, c.owner, c.mode); got != c.wantContains {
			t.Errorf("%s: problem %q, want %q", c.name, got, c.wantContains)
		}
	}
}

// standIn installs a runtime of the given size and mode and returns the adapter for it.
func standIn(t *testing.T, size int64, mode os.FileMode) (*adapter, string) {
	t.Helper()
	home := t.TempDir()
	if err := os.MkdirAll(RuntimeDir(home), 0o700); err != nil {
		t.Fatal(err)
	}
	p := RuntimePath(home)
	if err := os.WriteFile(p, []byte("#!/bin/sh\necho '"+Version+" (Claude Code)'\nexit\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(p, size); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(p, mode); err != nil {
		t.Fatal(err)
	}
	return installer(home, nil), p
}

func TestRuntimeSizeRule(t *testing.T) {
	if _, ok := Supported(); !ok {
		t.Skip("unsupported platform")
	}
	want, _ := pinFor("linux", "amd64")
	for _, c := range []struct {
		name string
		size int64
		seam bool
		ok   bool
	}{
		{"pinned size", want.size, false, true},
		{"one byte short", want.size - 1, false, false},
		{"one byte over", want.size + 1, false, false},
		{"unknown size under the test origin", 1000, true, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv(SeamEnv, "http://127.0.0.1:1") // restored when the test ends
			if !c.seam {
				os.Unsetenv(SeamEnv)
			}
			a, p := standIn(t, c.size, 0o755)
			_, err := a.binary()
			if c.ok {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			e := wantError(t, err, "executor/unavailable")
			for _, s := range []string{p, "remove " + RuntimeDir(a.opts.Home) + " and run again", itoa(c.size), itoa(want.size)} {
				if !strings.Contains(e.Detail, s) {
					t.Fatalf("detail %q lacks %q", e.Detail, s)
				}
			}
		})
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func TestRuntimeOwnerAndWritePermissions(t *testing.T) {
	t.Setenv(SeamEnv, "http://127.0.0.1:1")
	for _, c := range []struct {
		name    string
		target  func(a *adapter, p string) string
		mode    os.FileMode
		problem string
	}{
		{"0555 runtime", func(a *adapter, p string) string { return p }, 0o555, ""},
		{"group-writable runtime", func(a *adapter, p string) string { return p }, 0o775, "writable by group"},
		{"runtime writable by others", func(a *adapter, p string) string { return p }, 0o757, "writable by others"},
		{"writable folder", func(a *adapter, p string) string { return RuntimeDir(a.opts.Home) }, 0o777, "writable by"},
		{"group-writable root", func(a *adapter, p string) string { return Root(a.opts.Home) }, 0o775, "writable by group"},
	} {
		t.Run(c.name, func(t *testing.T) {
			a, p := standIn(t, 1000, 0o755)
			target := c.target(a, p)
			if err := os.Chmod(target, c.mode); err != nil {
				t.Fatal(err)
			}
			_, err := a.binary()
			if c.problem == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			e := wantError(t, err, "executor/unavailable")
			for _, s := range []string{target, c.problem, "remove " + RuntimeDir(a.opts.Home) + " and run again"} {
				if !strings.Contains(e.Detail, s) {
					t.Fatalf("detail %q lacks %q", e.Detail, s)
				}
			}
			if st, err := os.Stat(target); err != nil || st.Mode().Perm() != c.mode {
				t.Fatalf("the adapter changed %s: %v %v", target, st, err)
			}
		})
	}
}

func TestVersionAnswerIsReusedOnlyForTheSameFile(t *testing.T) {
	t.Setenv(SeamEnv, "http://127.0.0.1:1")
	home := t.TempDir()
	if err := os.MkdirAll(RuntimeDir(home), 0o700); err != nil {
		t.Fatal(err)
	}
	p := RuntimePath(home)
	calls := filepath.Join(home, "calls")
	script := func(version string) []byte {
		return []byte("#!/bin/sh\necho x >> '" + calls + "'\necho '" + version + " (Claude Code)'\nexit\n")
	}
	if err := os.WriteFile(p, script(Version), 0o755); err != nil {
		t.Fatal(err)
	}
	runs := func() int {
		b, _ := os.ReadFile(calls)
		return strings.Count(string(b), "x")
	}
	a := installer(home, nil)
	want := "claude-code " + Version + " (Claude Code)"
	for i := 0; i < 3; i++ {
		if got := a.Describe().Version; got != want {
			t.Fatal(got)
		}
	}
	if runs() != 1 {
		t.Fatalf("--version ran %d times for an unchanged runtime", runs())
	}
	for _, change := range []string{"rename", "rewrite"} {
		time.Sleep(20 * time.Millisecond)
		before := runs()
		switch change {
		case "rename":
			if err := os.WriteFile(p+".new", script("0.0.0"), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.Rename(p+".new", p); err != nil {
				t.Fatal(err)
			}
		case "rewrite":
			if err := os.WriteFile(p, script("0.0.1"), 0o755); err != nil {
				t.Fatal(err)
			}
		}
		if got := a.Describe().Version; strings.Contains(got, Version) || runs() != before+1 {
			t.Fatalf("%s: version %q after %d runs (was %d)", change, got, runs(), before)
		}
	}
}
