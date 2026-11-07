package claudecode

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func TestPinTable(t *testing.T) {
	if Version != "2.1.318" {
		t.Fatalf("version %q", Version)
	}
	for goos, want := range map[string]pin{
		"darwin/arm64": {"darwin-arm64", "677a2ea7bf576cedd20e191d973914ed8a41796f53a63b1923381ddc4d5b5e7d", 319598464},
		"linux/amd64":  {"linux-x64", "708c77b204db30086ff6f1ed34577bda03e1be74ced80557cbf7b54249ebf0bd", 337814032},
	} {
		parts := strings.Split(goos, "/")
		if got, ok := pinFor(parts[0], parts[1]); !ok || got != want {
			t.Errorf("%s: %+v %v", goos, got, ok)
		}
	}
	for _, p := range [][2]string{{"darwin", "amd64"}, {"linux", "arm64"}, {"windows", "amd64"}, {"freebsd", "amd64"}} {
		if _, ok := pinFor(p[0], p[1]); ok {
			t.Errorf("%s/%s is supported", p[0], p[1])
		}
	}
	if got, want := UnsupportedMessage("windows", "amd64"), "Kogen's Claude Code runtime supports macOS on Apple Silicon and Linux x86-64 only, not windows/amd64"; got != want {
		t.Errorf("message %q", got)
	}
	if got := RuntimePath("/h"); got != "/h/.kogen/claude-code/"+Version+"/claude" {
		t.Errorf("path %q", got)
	}
}

func TestUnsupportedPlatformStopsTheRole(t *testing.T) {
	t.Setenv(SeamEnv, "http://127.0.0.1:1")
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
	o := h.f.options()
	a := New(o).(*adapter)
	a.goos, a.goarch = "windows", "amd64"
	_, err := a.Start(context.Background(), h.task, nil)
	if e := wantError(t, err, "executor/unavailable"); e.Detail != UnsupportedMessage("windows", "amd64") {
		t.Fatalf("detail %q", e.Detail)
	}
}

func TestSeamIsLoopbackOnly(t *testing.T) {
	for _, ok := range []string{"http://127.0.0.1:8080", "http://localhost:1"} {
		t.Setenv(SeamEnv, ok)
		if origin, set, err := seamOrigin(); err != nil || !set || origin != ok {
			t.Errorf("%s: %q %v %v", ok, origin, set, err)
		}
	}
	for _, bad := range []string{"", "https://127.0.0.1:8080", "http://example.com:80", "http://127.0.0.1", "http://localhost:80/x", "http://127.0.0.1:80/"} {
		t.Setenv(SeamEnv, bad)
		_, _, err := seamOrigin()
		wantError(t, err, "executor/unavailable")
		if !strings.Contains(err.Error(), SeamEnv+" must be http://127.0.0.1:<port> or http://localhost:<port>") {
			t.Errorf("%q: %v", bad, err)
		}
	}
	t.Setenv(SeamEnv, "https://example.com")
	home := t.TempDir()
	a := installer(home, nil)
	wantError(t, a.ensureRuntime(context.Background()), "executor/unavailable")
	if _, err := os.Lstat(RuntimeDir(home)); err == nil {
		t.Fatal("something was installed")
	}
}

// installer is an adapter on a fixed supported platform, so the tests run on any host.
func installer(home string, stderr *bytes.Buffer) *adapter {
	o := Options{Home: home, Stderr: io.Discard}
	if stderr != nil {
		o.Stderr = stderr
	}
	a := New(o).(*adapter)
	a.goos, a.goarch = "linux", "amd64"
	return a
}

func sum(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

// seam serves the official manifest shape and the runtime of linux-x64, and counts requests.
type seam struct {
	*httptest.Server
	mu        sync.Mutex
	requests  []string
	downloads atomic.Int32
}

func newSeam(t *testing.T, binary []byte, checksum string, serve func(w http.ResponseWriter, r *http.Request, binary []byte)) *seam {
	t.Helper()
	s := &seam{}
	if checksum == "" {
		checksum = sum(binary)
	}
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		s.requests = append(s.requests, r.URL.Path)
		s.mu.Unlock()
		switch r.URL.Path {
		case "/" + Version + "/manifest.json":
			fmt.Fprintf(w, `{"version":"`+Version+`","platforms":{"linux-x64":{"binary":"claude","checksum":%q,"size":%d}}}`, checksum, len(binary))
		case "/" + Version + "/linux-x64/claude":
			s.downloads.Add(1)
			if serve != nil {
				serve(w, r, binary)
				return
			}
			w.Header().Set("Content-Length", fmt.Sprint(len(binary)))
			w.Write(binary)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(s.Close)
	t.Setenv(SeamEnv, s.URL)
	return s
}

// script is a runtime that logs every start to log and answers --version.
func script(version, log string) []byte {
	return []byte("#!/bin/sh\nprintf '%s\\n' \"$*\" >> '" + log + "'\necho '" + version + "'\n")
}

func entries(t *testing.T, dir string) []string {
	t.Helper()
	list, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range list {
		names = append(names, e.Name())
	}
	return names
}

func TestInstallsThePinnedRuntime(t *testing.T) {
	log := filepath.Join(t.TempDir(), "runs")
	binary := script(Version+" (Claude Code)", log)
	s := newSeam(t, binary, "", nil)
	home := t.TempDir()
	var stderr bytes.Buffer
	if err := installer(home, &stderr).ensureRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}
	want := "kogen: installing Claude Code " + Version + " into " + RuntimeDir(home) + "\nkogen: installed Claude Code " + Version + " (sha256 " + sum(binary) + ")\n"
	if stderr.String() != want {
		t.Fatalf("progress %q, want %q", stderr.String(), want)
	}
	got, err := os.ReadFile(RuntimePath(home))
	if err != nil || !bytes.Equal(got, binary) {
		t.Fatalf("installed bytes: %v", err)
	}
	for path, mode := range map[string]os.FileMode{RuntimePath(home): 0o755, RuntimeDir(home): 0o700, Root(home): 0o700, ConfigDir(home): 0o700} {
		if st, err := os.Stat(path); err != nil || st.Mode().Perm() != mode {
			t.Errorf("%s: %v %v", path, st, err)
		}
	}
	if names := entries(t, Root(home)); strings.Join(names, " ") != Version+" config install.lock" {
		t.Fatalf("entries %v", names)
	}
	// Only the verification ran the downloaded bytes, from the partial directory.
	runs, _ := os.ReadFile(log)
	if string(runs) != "--version\n" || s.downloads.Load() != 1 {
		t.Fatalf("runs %q downloads %d", runs, s.downloads.Load())
	}
	// A second role start finds the runtime and asks nothing.
	if err := installer(home, &stderr).ensureRuntime(context.Background()); err != nil || s.downloads.Load() != 1 || len(s.requests) != 2 {
		t.Fatalf("second start: %v, requests %v", err, s.requests)
	}
}

func TestInstallRefusals(t *testing.T) {
	log := filepath.Join(t.TempDir(), "runs")
	good := script(Version+" (Claude Code)", log)
	cases := []struct {
		name   string
		binary []byte
		sum    string
		serve  func(http.ResponseWriter, *http.Request, []byte)
		want   string
		ran    bool
	}{
		{"digest mismatch", good, sum([]byte("other")), nil, "the downloaded Claude Code " + Version + " does not match its pinned SHA-256; nothing was installed", false},
		{"size mismatch", good, "", func(w http.ResponseWriter, r *http.Request, b []byte) { w.Write(append(append([]byte{}, b...), '#')) }, fmt.Sprintf("cannot download Claude Code "+Version+" from %%s/"+Version+"/linux-x64/claude: the response announces %d bytes, expected %d; nothing was installed", len(good)+1, len(good)), false},
		{"another version", script("2.1.314 (Claude Code)", log), "", nil, "the downloaded Claude Code reports 2.1.314 (Claude Code), not " + Version + "; nothing was installed", true},
		{"not found", good, "", func(w http.ResponseWriter, r *http.Request, b []byte) { http.NotFound(w, r) }, "cannot download Claude Code " + Version + " from %s/" + Version + "/linux-x64/claude: HTTP 404 Not Found", false},
		{"dropped connection", good, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
			w.Header().Set("Content-Length", fmt.Sprint(len(b)))
			w.Write(b[:len(b)/2])
			w.(http.Flusher).Flush()
			panic(http.ErrAbortHandler)
		}, "cannot download Claude Code " + Version + " from %s/" + Version + "/linux-x64/claude: ", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			os.Remove(log)
			s := newSeam(t, c.binary, c.sum, c.serve)
			home := t.TempDir()
			// A leftover of an interrupted installation is removed by the next installation.
			leftover := filepath.Join(Root(home), ".partial-killed")
			if err := os.MkdirAll(leftover, 0o700); err != nil {
				t.Fatal(err)
			}
			err := installer(home, nil).ensureRuntime(context.Background())
			e := wantError(t, err, "executor/unavailable")
			if want := strings.Replace(c.want, "%s", s.URL, 1); !strings.HasPrefix(e.Detail, want) || (c.name != "dropped connection" && e.Detail != want) {
				t.Fatalf("detail %q, want %q", e.Detail, want)
			}
			if names := entries(t, Root(home)); strings.Join(names, " ") != "config install.lock" {
				t.Fatalf("entries %v", names)
			}
			if _, err := os.Stat(log); c.ran != (err == nil) {
				t.Fatalf("downloaded bytes ran = %v, want %v", err == nil, c.ran)
			}
		})
	}
}

func TestNextInstallRecoversAfterAFailure(t *testing.T) {
	log := filepath.Join(t.TempDir(), "runs")
	binary := script(Version+" (Claude Code)", log)
	var fail atomic.Bool
	fail.Store(true)
	s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
		if fail.Load() {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		w.Write(b)
	})
	home := t.TempDir()
	wantError(t, installer(home, nil).ensureRuntime(context.Background()), "executor/unavailable")
	fail.Store(false)
	if err := installer(home, nil).ensureRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}
	if s.downloads.Load() != 4 {
		t.Fatalf("downloads %d", s.downloads.Load())
	}
	if _, err := os.Stat(RuntimePath(home)); err != nil {
		t.Fatal(err)
	}
}

func TestConcurrentInstallationsSerialize(t *testing.T) {
	log := filepath.Join(t.TempDir(), "runs")
	binary := script(Version+" (Claude Code)", log)
	release := make(chan struct{})
	s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
		<-release
		w.Write(b)
	})
	home := t.TempDir()
	errs := make(chan error, 2)
	for range 2 {
		go func() { errs <- installer(home, nil).ensureRuntime(context.Background()) }()
	}
	deadline := time.Now().Add(5 * time.Second)
	for s.downloads.Load() == 0 {
		if time.Now().After(deadline) {
			t.Fatal("no installation started")
		}
		time.Sleep(10 * time.Millisecond)
	}
	time.Sleep(300 * time.Millisecond)
	if n := s.downloads.Load(); n != 1 {
		t.Fatalf("%d downloads while the first installation holds the lock", n)
	}
	close(release)
	for range 2 {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	if n := s.downloads.Load(); n != 1 {
		t.Fatalf("%d downloads, want 1", n)
	}
}

func TestWaitingForTheLockEndsWithTheContext(t *testing.T) {
	s := newSeam(t, script(Version+" (Claude Code)", filepath.Join(t.TempDir(), "runs")), "", nil)
	home := t.TempDir()
	if err := os.MkdirAll(Root(home), 0o700); err != nil {
		t.Fatal(err)
	}
	held, err := lockInstall(context.Background(), filepath.Join(Root(home), "install.lock"), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	wantError(t, installer(home, nil).ensureRuntime(ctx), "executor/deadline")
	if len(s.requests) != 0 {
		t.Fatalf("requests %v", s.requests)
	}
}

func TestInstalledRuntimeIsNeverReplaced(t *testing.T) {
	s := newSeam(t, script(Version+" (Claude Code)", filepath.Join(t.TempDir(), "runs")), "", nil)
	home := t.TempDir()
	if err := os.MkdirAll(RuntimeDir(home), 0o700); err != nil {
		t.Fatal(err)
	}
	other := script("2.1.314 (Claude Code)", filepath.Join(t.TempDir(), "runs"))
	if err := os.WriteFile(RuntimePath(home), other, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := installer(home, nil).ensureRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(RuntimePath(home))
	if !bytes.Equal(got, other) || len(s.requests) != 0 {
		t.Fatalf("replaced or downloaded: %v", s.requests)
	}
}

func TestOlderVersionDirectoryIsUntouched(t *testing.T) {
	newSeam(t, script(Version+" (Claude Code)", filepath.Join(t.TempDir(), "runs")), "", nil)
	home := t.TempDir()
	old := filepath.Join(Root(home), "2.1.300", "claude")
	if err := os.MkdirAll(filepath.Dir(old), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(old, []byte("old"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := installer(home, nil).ensureRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(old); err != nil || string(b) != "old" {
		t.Fatalf("older runtime changed: %q %v", b, err)
	}
}

func TestConfigDirectoryPermissions(t *testing.T) {
	for _, kind := range []string{"linked", "missing", "plain"} {
		t.Run(kind, func(t *testing.T) {
			home := t.TempDir()
			if err := os.MkdirAll(RuntimeDir(home), 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(RuntimePath(home), []byte("runtime"), 0o700); err != nil {
				t.Fatal(err)
			}
			config := ConfigDir(home)
			target := config
			if kind == "linked" {
				target = filepath.Join(home, ".claude-bench")
			}
			if kind != "missing" {
				if err := os.Mkdir(target, 0o700); err != nil {
					t.Fatal(err)
				}
				if err := os.Chmod(target, 0o775); err != nil {
					t.Fatal(err)
				}
			}
			if kind == "linked" {
				if err := os.Symlink(target, config); err != nil {
					t.Fatal(err)
				}
			}
			if err := installer(home, nil).ensureRuntime(context.Background()); err != nil {
				t.Fatal(err)
			}
			st, err := os.Stat(target)
			if err != nil {
				t.Fatal(err)
			}
			want := os.FileMode(0o700)
			if kind == "linked" {
				want = 0o775
			}
			if st.Mode().Perm() != want {
				t.Errorf("mode = %o, want %o", st.Mode().Perm(), want)
			}
			link, err := os.Lstat(config)
			if err != nil {
				t.Fatal(err)
			}
			if got := link.Mode()&os.ModeSymlink != 0; got != (kind == "linked") {
				t.Errorf("symlink = %v", got)
			}
		})
	}
}

func TestUnusableRuntimeEntries(t *testing.T) {
	for _, kind := range []string{"dangling", "directory", "empty", "not executable"} {
		t.Run(kind, func(t *testing.T) {
			s := newSeam(t, []byte("unused"), "", nil)
			h := newHarness(t, fakeConfig{})
			opts := h.f.options()
			p := RuntimePath(opts.Home)
			if err := os.Remove(p); err != nil {
				t.Fatal(err)
			}
			switch kind {
			case "dangling":
				if err := os.Symlink("missing", p); err != nil {
					t.Fatal(err)
				}
			case "directory":
				if err := os.Mkdir(p, 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(p, "keep"), []byte("keep"), 0600); err != nil {
					t.Fatal(err)
				}
			case "empty":
				if err := os.WriteFile(p, nil, 0755); err != nil {
					t.Fatal(err)
				}
			case "not executable":
				if err := os.WriteFile(p, []byte("keep"), 0644); err != nil {
					t.Fatal(err)
				}
			}
			a := New(opts).(*adapter)
			for _, run := range []func() error{
				func() error { _, err := a.Start(context.Background(), h.task, nil); return err },
				func() error { return a.install(context.Background()) },
				func() error { _, err := a.binary(); return err },
			} {
				e := wantError(t, run(), "executor/unavailable")
				if !strings.Contains(e.Detail, kind) || !strings.Contains(e.Detail, "remove "+RuntimeDir(opts.Home)+" and run again") {
					t.Fatalf("detail: %s", e.Detail)
				}
			}
			if len(s.requests) != 0 {
				t.Fatalf("unexpected requests: %v", s.requests)
			}
			switch kind {
			case "dangling":
				target, err := os.Readlink(p)
				if err != nil || target != "missing" {
					t.Fatalf("link: %q %v", target, err)
				}
			case "directory":
				b, err := os.ReadFile(filepath.Join(p, "keep"))
				if err != nil || string(b) != "keep" {
					t.Fatalf("directory: %q %v", b, err)
				}
			default:
				b, err := os.ReadFile(p)
				if err != nil {
					t.Fatal(err)
				}
				want := "keep"
				if kind == "empty" {
					want = ""
				}
				if string(b) != want {
					t.Fatalf("content: %q", b)
				}
			}
		})
	}
}

func TestDownloadIdleProgressAndStall(t *testing.T) {
	for _, tc := range []struct {
		name      string
		gap       time.Duration
		firstByte bool
		stalled   bool
	}{
		{"progress", 120 * time.Millisecond, false, false},
		{"gap expires", 350 * time.Millisecond, false, true},
		{"first byte expires", 350 * time.Millisecond, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			binary := script(Version+" (Claude Code)", filepath.Join(t.TempDir(), "runs"))
			s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
				w.Header().Set("Content-Length", fmt.Sprint(len(b)))
				w.WriteHeader(http.StatusOK)
				w.(http.Flusher).Flush()
				if !tc.firstByte {
					w.Write(b[:1])
					w.(http.Flusher).Flush()
				}
				for i := 1; i < 4; i++ {
					select {
					case <-r.Context().Done():
						return
					case <-time.After(tc.gap):
					}
					if !tc.firstByte {
						w.Write(b[i : i+1])
						w.(http.Flusher).Flush()
					}
				}
				if tc.firstByte {
					w.Write(b)
				} else {
					w.Write(b[4:])
				}
			})
			home := t.TempDir()
			a := installer(home, nil)
			a.setDownloadIdleTimeoutForTest(200 * time.Millisecond)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			result := make(chan error, 1)
			go func() { result <- a.ensureRuntime(ctx) }()
			var err error
			select {
			case err = <-result:
			case <-time.After(3 * time.Second):
				cancel()
				<-result
				t.Fatal("download did not finish")
			}
			if tc.stalled {
				e := wantError(t, err, "executor/unavailable")
				if !strings.Contains(e.Detail, s.URL) || !strings.Contains(e.Detail, "stalled") {
					t.Fatalf("detail %q", e.Detail)
				}
				if names := entries(t, Root(home)); strings.Join(names, " ") != "config install.lock" {
					t.Fatalf("entries %v", names)
				}
				f, err := os.OpenFile(filepath.Join(Root(home), "install.lock"), os.O_RDWR, 0)
				if err != nil {
					t.Fatal(err)
				}
				defer f.Close()
				if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
					t.Fatal(err)
				}
			} else if err != nil {
				t.Fatal(err)
			}
		})
	}
}

type lateBody struct {
	ctx  context.Context
	data []byte
	end  error
}

func (b *lateBody) Read(p []byte) (int, error) {
	if len(b.data) > 0 {
		n := copy(p, b.data)
		b.data = b.data[n:]
		return n, nil
	}
	<-b.ctx.Done()
	return 0, b.end
}

func (b *lateBody) Close() error { return nil }

type lateTransport struct {
	data []byte
	end  error
}

func (t lateTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return &http.Response{StatusCode: 200, Status: "200 OK", ContentLength: -1, Header: http.Header{}, Body: &lateBody{r.Context(), t.data, t.end}, Request: r}, nil
}

// An expired idle timer is a stall only for a copy error or a short body; a complete body whose
// clean end arrives after the expiry continues through the ordinary checks.
func TestDownloadLateEndAfterIdleExpiry(t *testing.T) {
	body := script(Version, filepath.Join(t.TempDir(), "runs"))
	want := pin{sha256: sum(body), size: int64(len(body))}
	for _, tc := range []struct {
		name    string
		data    []byte
		end     error
		stalled bool
	}{
		{"complete, clean end", body, io.EOF, false},
		{"complete, read error", body, errors.New("reset"), true},
		{"short, clean end", body[:len(body)/2], io.EOF, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			old := http.DefaultClient
			http.DefaultClient = &http.Client{Transport: lateTransport{tc.data, tc.end}}
			defer func() { http.DefaultClient = old }()
			a := installer(t.TempDir(), nil)
			a.setDownloadIdleTimeoutForTest(200 * time.Millisecond)
			file := filepath.Join(t.TempDir(), "claude")
			digest, retry, err := a.downloadBinary(context.Background(), "http://127.0.0.1:9/claude", file, want)
			if retry {
				t.Fatalf("retry: %v", err)
			}
			if !tc.stalled {
				got, e := os.ReadFile(file)
				if err != nil || digest != want.sha256 || e != nil || !bytes.Equal(got, body) {
					t.Fatalf("digest %q err %v read %v", digest, err, e)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), "connection stalled") {
				t.Fatalf("%v", err)
			}
		})
	}
}

func TestDownloadRetryTimingAndFreshBody(t *testing.T) {
	for _, mismatch := range []bool{false, true} {
		t.Run(fmt.Sprint(mismatch), func(t *testing.T) {
			binary := script(Version, filepath.Join(t.TempDir(), "runs"))
			var times []time.Time
			s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
				times = append(times, time.Now())
				if len(times) < 3 {
					w.Header().Set("Content-Length", fmt.Sprint(len(b)))
					w.Write(b[:len(b)/2])
					w.(http.Flusher).Flush()
					panic(http.ErrAbortHandler)
				}
				if mismatch {
					w.Write(b[:len(b)/2])
					return
				}
				w.Write(b)
			})
			home := t.TempDir()
			var logs bytes.Buffer
			err := installer(home, &logs).ensureRuntime(context.Background())
			if mismatch {
				if want := fmt.Sprintf("the response announces %d bytes, expected %d; nothing was installed", len(binary)/2, len(binary)); err == nil || !strings.Contains(err.Error(), want) {
					t.Fatalf("%v", err)
				}
			} else {
				if err != nil {
					t.Fatal(err)
				}
				got, e := os.ReadFile(RuntimePath(home))
				if e != nil || !bytes.Equal(got, binary) {
					t.Fatalf("bytes %q: %v", got, e)
				}
			}
			if s.downloads.Load() != 3 || len(times) != 3 || times[1].Sub(times[0]) < 90*time.Millisecond || times[2].Sub(times[1]) < 190*time.Millisecond || strings.Count(logs.String(), "retry") != 2 {
				t.Fatalf("times %v logs %s", times, logs.String())
			}
		})
	}
}

func TestRetryPauseHoldsLockAndCancels(t *testing.T) {
	binary := script(Version, filepath.Join(t.TempDir(), "runs"))
	hit := make(chan struct{}, 1)
	s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
		hit <- struct{}{}
		http.Error(w, "unavailable", 503)
	})
	home := t.TempDir()
	a := installer(home, nil)
	a.setDownloadRetryDelayForTest(time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- a.ensureRuntime(ctx) }()
	<-hit
	lockCtx, lockCancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer lockCancel()
	lock, err := lockInstall(lockCtx, filepath.Join(Root(home), "install.lock"), io.Discard)
	if err == nil {
		lock.Close()
		t.Fatal("lock released during pause")
	}
	cancel()
	select {
	case err := <-done:
		wantError(t, err, "executor/interrupted")
	case <-time.After(time.Second):
		t.Fatal("cancel did not interrupt pause")
	}
	lock, err = lockInstall(context.Background(), filepath.Join(Root(home), "install.lock"), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	lock.Close()
	if s.downloads.Load() != 1 {
		t.Fatal(s.downloads.Load())
	}
}

func TestDownloadTransportErrors(t *testing.T) {
	for _, source := range []string{"http://127.0.0.1:1/claude", "http://nonexistent.invalid/claude"} {
		t.Run(source, func(t *testing.T) {
			// Bypass proxy configuration so the DNS and connection failures reach the client.
			old := http.DefaultClient
			http.DefaultClient = &http.Client{Transport: &http.Transport{Proxy: nil}}
			defer func() { http.DefaultClient = old }()
			_, retry, err := installer(t.TempDir(), nil).downloadBinary(context.Background(), source, filepath.Join(t.TempDir(), "claude"), pin{size: 1})
			if err == nil || !retry {
				t.Fatalf("retry %v: %v", retry, err)
			}
		})
	}
}

func TestDownloadContextStopsWithoutRetry(t *testing.T) {
	for _, phase := range []string{"before body", "during body", "pause"} {
		for _, deadline := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s deadline=%v", phase, deadline), func(t *testing.T) {
				binary := script(Version, filepath.Join(t.TempDir(), "runs"))
				reached := make(chan struct{}, 1)
				s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
					if phase == "pause" {
						reached <- struct{}{}
						http.Error(w, "down", 503)
						return
					}
					if phase == "during body" {
						w.Header().Set("Content-Length", fmt.Sprint(len(b)))
						w.WriteHeader(200)
						w.Write(b[:1])
						w.(http.Flusher).Flush()
					}
					reached <- struct{}{}
					<-r.Context().Done()
				})
				home := t.TempDir()
				a := installer(home, nil)
				a.setDownloadRetryDelayForTest(time.Second)
				var ctx context.Context
				var cancel context.CancelFunc
				if deadline {
					ctx, cancel = context.WithTimeout(context.Background(), 200*time.Millisecond)
				} else {
					ctx, cancel = context.WithCancel(context.Background())
				}
				defer cancel()
				done := make(chan error, 1)
				go func() { done <- a.ensureRuntime(ctx) }()
				<-reached
				if !deadline {
					cancel()
				}
				select {
				case err := <-done:
					reason := "executor/interrupted"
					if deadline {
						reason = "executor/deadline"
					}
					wantError(t, err, reason)
				case <-time.After(2 * time.Second):
					t.Fatal("context did not stop download")
				}
				if s.downloads.Load() != 1 {
					t.Fatalf("requests %d", s.downloads.Load())
				}
			})
		}
	}
}

func TestDownloadHeaderTimeoutRetriesSilentBinary(t *testing.T) {
	binary := script(Version, filepath.Join(t.TempDir(), "runs"))
	s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
		<-r.Context().Done()
	})
	home := t.TempDir()
	var logs bytes.Buffer
	a := installer(home, &logs)
	a.setDownloadHeaderTimeoutForTest(100 * time.Millisecond)
	a.setDownloadRetryDelayForTest(time.Millisecond)
	start := time.Now()
	err := a.ensureRuntime(context.Background())
	source := s.URL + "/" + Version + "/linux-x64/claude"
	want := "cannot download Claude Code " + Version + " from " + source + ": the server did not answer; 3 attempts"
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("%v", err)
	}
	wantError(t, err, "executor/unavailable")
	if s.downloads.Load() != 3 || strings.Count(logs.String(), "the server did not answer; retry after pause") != 2 || time.Since(start) > 5*time.Second {
		t.Fatalf("downloads %d logs %s", s.downloads.Load(), logs.String())
	}
	for _, e := range entries(t, filepath.Join(home, ".kogen", "claude-code")) {
		if strings.HasPrefix(e, ".partial-") {
			t.Fatalf("partial left: %s", e)
		}
	}
}

func TestDownloadHeaderTimeoutDoesNotCutSlowBody(t *testing.T) {
	binary := script(Version, filepath.Join(t.TempDir(), "runs"))
	s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
		w.Header().Set("Content-Length", fmt.Sprint(len(b)))
		w.Write(b[:1])
		w.(http.Flusher).Flush()
		time.Sleep(300 * time.Millisecond)
		w.Write(b[1:])
	})
	a := installer(t.TempDir(), nil)
	a.setDownloadHeaderTimeoutForTest(100 * time.Millisecond)
	if err := a.ensureRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}
	if s.downloads.Load() != 1 {
		t.Fatalf("requests %d", s.downloads.Load())
	}
}

func TestDownloadHeaderTimeoutSilentManifestIsSingleAttempt(t *testing.T) {
	var manifests atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "manifest.json") {
			manifests.Add(1)
		}
		<-r.Context().Done()
	}))
	defer srv.Close()
	t.Setenv(SeamEnv, srv.URL)
	a := installer(t.TempDir(), nil)
	a.setDownloadHeaderTimeoutForTest(100 * time.Millisecond)
	err := a.ensureRuntime(context.Background())
	want := "cannot download Claude Code " + Version + " from " + srv.URL + "/" + Version + "/manifest.json: the server did not answer"
	if err == nil || !strings.Contains(err.Error(), want) || strings.Contains(err.Error(), "attempts") {
		t.Fatalf("%v", err)
	}
	wantError(t, err, "executor/unavailable")
	if manifests.Load() != 1 {
		t.Fatalf("manifest requests %d", manifests.Load())
	}
}

func TestDownloadHeaderTimeoutYieldsToCallerDeadline(t *testing.T) {
	binary := script(Version, filepath.Join(t.TempDir(), "runs"))
	newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
		<-r.Context().Done()
	})
	a := installer(t.TempDir(), nil)
	a.setDownloadHeaderTimeoutForTest(5 * time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	err := a.ensureRuntime(ctx)
	wantError(t, err, "executor/deadline")
	if strings.Contains(err.Error(), "did not answer") {
		t.Fatalf("%v", err)
	}
}

func TestInstallNamesALocalCreateFailure(t *testing.T) {
	binary := script(Version+" (Claude Code)", filepath.Join(t.TempDir(), "runs"))
	home := t.TempDir()
	s := newSeam(t, binary, "", func(w http.ResponseWriter, r *http.Request, b []byte) {
		// A directory at the partial file's path makes the open fail.
		partial, _ := filepath.Glob(filepath.Join(Root(home), ".partial-*"))
		for _, p := range partial {
			os.Mkdir(filepath.Join(p, "claude"), 0o700)
		}
		w.Header().Set("Content-Length", fmt.Sprint(len(b)))
		w.Write(b)
	})
	var stderr bytes.Buffer
	err := installer(home, &stderr).ensureRuntime(context.Background())
	e := wantError(t, err, "executor/unavailable")
	partial, _ := filepath.Glob(filepath.Join(Root(home), ".partial-*"))
	if len(partial) != 0 {
		t.Fatalf("partial directories %v", partial)
	}
	if !strings.HasPrefix(e.Detail, "local write failure: cannot create "+Root(home)+"/.partial-") || !strings.HasSuffix(e.Detail, "/claude: is a directory; nothing was installed") || strings.Contains(e.Detail, "cannot download") || strings.Contains(e.Detail, s.URL) {
		t.Fatalf("detail %q", e.Detail)
	}
	if s.downloads.Load() != 1 || strings.Contains(stderr.String(), "download attempt") {
		t.Fatalf("downloads %d, stderr %q", s.downloads.Load(), stderr.String())
	}
	if _, err := os.Lstat(RuntimeDir(home)); err == nil {
		t.Fatal("something was installed")
	}
}

func TestInstallFlushesTheFileBeforeAndTheRootAfterPublication(t *testing.T) {
	binary := script(Version+" (Claude Code)", filepath.Join(t.TempDir(), "runs"))
	newSeam(t, binary, "", nil)
	home := t.TempDir()
	var steps []string
	a := installer(home, nil)
	a.setSyncForTest(func(f *os.File) error {
		st, err := f.Stat()
		if err != nil {
			return err
		}
		_, pubErr := os.Lstat(RuntimeDir(home))
		if st.IsDir() {
			steps = append(steps, fmt.Sprintf("dir %s published=%t", f.Name(), pubErr == nil))
		} else {
			steps = append(steps, fmt.Sprintf("file %d published=%t", st.Size(), pubErr == nil))
		}
		return f.Sync()
	})
	if err := a.ensureRuntime(context.Background()); err != nil {
		t.Fatal(err)
	}
	want := fmt.Sprintf("file %d published=false|dir %s published=true", len(binary), Root(home))
	if got := strings.Join(steps, "|"); got != want {
		t.Fatalf("flushes %q, want %q", got, want)
	}
}

func TestInstallFileFlushFailureIsUnpublishedAndNotRetried(t *testing.T) {
	binary := script(Version+" (Claude Code)", filepath.Join(t.TempDir(), "runs"))
	s := newSeam(t, binary, "", nil)
	home := t.TempDir()
	a := installer(home, nil)
	a.setSyncForTest(func(f *os.File) error { return errors.New("injected sync failure") })
	e := wantError(t, a.ensureRuntime(context.Background()), "executor/unavailable")
	if !strings.HasPrefix(e.Detail, "cannot flush "+Root(home)+"/.partial-") || !strings.HasSuffix(e.Detail, "/claude to disk: injected sync failure; nothing was installed") {
		t.Fatalf("detail %q", e.Detail)
	}
	if s.downloads.Load() != 1 {
		t.Fatalf("downloads %d", s.downloads.Load())
	}
	if names := entries(t, Root(home)); strings.Join(names, " ") != "config install.lock" {
		t.Fatalf("entries %v", names)
	}
}

func TestInstallRootFlushFailureRemovesThePublishedDirectory(t *testing.T) {
	binary := script(Version+" (Claude Code)", filepath.Join(t.TempDir(), "runs"))
	newSeam(t, binary, "", nil)
	home := t.TempDir()
	var stderr bytes.Buffer
	a := installer(home, &stderr)
	a.setSyncForTest(func(f *os.File) error {
		if st, err := f.Stat(); err == nil && st.IsDir() {
			return errors.New("injected sync failure")
		}
		return f.Sync()
	})
	e := wantError(t, a.ensureRuntime(context.Background()), "executor/unavailable")
	if want := "cannot flush " + Root(home) + " to disk: injected sync failure; nothing was installed"; e.Detail != want {
		t.Fatalf("detail %q, want %q", e.Detail, want)
	}
	if strings.Contains(stderr.String(), "kogen: installed") {
		t.Fatalf("stderr %q", stderr.String())
	}
	if names := entries(t, Root(home)); strings.Join(names, " ") != "config install.lock" {
		t.Fatalf("entries %v", names)
	}
}
