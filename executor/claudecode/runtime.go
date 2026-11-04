package claudecode

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-loop/sys"
)

// Version is the one Claude Code version Kogen runs. Kogen's binary carries it as the only
// version source: a newer Kogen release pins a newly tested version, nothing selects another.
const Version = "2.1.312"

// SeamEnv is the test-only download origin (http://127.0.0.1:<port> or http://localhost:<port>).
const SeamEnv = "KOGEN_CLAUDE_CODE_URL"

const downloadIdleTimeout = 30 * time.Second
const downloadAttempts = 3
const downloadRetryDelay = 100 * time.Millisecond

func (a *adapter) setDownloadRetryDelayForTest(d time.Duration) { a.downloadRetryDelay = d }

func (a *adapter) setDownloadIdleTimeoutForTest(d time.Duration) { a.downloadIdle = d }

const downloadBase = "https://downloads.claude.ai/claude-code-releases"

// pin is what Anthropic's native-installer manifest of Version lists for one platform.
type pin struct {
	platform string
	sha256   string
	size     int64
}

// pinFor is the pin of a GOOS/GOARCH; ok is false for an unsupported platform.
func pinFor(goos, goarch string) (pin, bool) {
	switch goos + "/" + goarch {
	case "darwin/arm64":
		return pin{"darwin-arm64", "6b5ec691195e551b02c41df9f7d723f4ea61eaa03c2df90acefe3736f1aeb620", 275988512}, true
	case "linux/amd64":
		return pin{"linux-x64", "4f4178ce41d83e23341ebfbaecdbcf8ea6bf7baea0690025abe49eeec3a5d01d", 293592432}, true
	}
	return pin{}, false
}

// Supported is the pin of this machine's platform; ok is false when Kogen's runtime does not
// support it.
func Supported() (platform string, ok bool) {
	p, ok := pinFor(runtime.GOOS, runtime.GOARCH)
	return p.platform, ok
}

// UnsupportedMessage is the refusal on any other platform.
func UnsupportedMessage(goos, goarch string) string {
	return "Kogen's Claude Code runtime supports macOS on Apple Silicon and Linux x86-64 only, not " + goos + "/" + goarch
}

// Root is <home>/.kogen/claude-code, the folder Kogen owns for its Claude Code.
func Root(home string) string { return filepath.Join(home, ".kogen", "claude-code") }

// RuntimeDir is the folder of the pinned version.
func RuntimeDir(home string) string { return filepath.Join(Root(home), Version) }

// RuntimePath is the one executable Kogen runs.
func RuntimePath(home string) string { return filepath.Join(RuntimeDir(home), "claude") }

// ConfigDir is Kogen's own Claude Code configuration directory.
func ConfigDir(home string) string { return filepath.Join(Root(home), "config") }

// Pinned reports whether the answer of `claude --version` has the pinned version as its first
// whitespace-separated field.
func Pinned(answer string) bool {
	f := strings.Fields(answer)
	return len(f) > 0 && f[0] == Version
}

// NotPinnedMessage says that the runtime at path reports another version.
func NotPinnedMessage(path, answer string) string {
	return "Kogen's Claude Code at " + path + " reports " + answer + ", not the pinned " + Version
}

func unavailable(msg string) error { return executor.Fail(executor.ReasonUnavailable, msg) }

var seamRe = regexp.MustCompile(`^http://(127\.0\.0\.1|localhost):[0-9]+$`)
var checksumRe = regexp.MustCompile(`^[0-9a-f]{64}$`)

// seamOrigin is the test download origin; ok is false when none is set.
func seamOrigin() (origin string, set bool, err error) {
	v, set := os.LookupEnv(SeamEnv)
	if !set {
		return "", false, nil
	}
	if !seamRe.MatchString(v) {
		return "", true, unavailable(SeamEnv + " must be http://127.0.0.1:<port> or http://localhost:<port>")
	}
	return v, true, nil
}

// runtimeUsable distinguishes an absent entry from one that requires user intervention.
func runtimeUsable(home string) (bool, error) {
	p := RuntimePath(home)
	info, err := os.Lstat(p)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, unavailable("cannot inspect " + p + ": " + err.Error())
	}
	if info.Mode()&os.ModeSymlink != 0 {
		info, err = os.Stat(p)
		if errors.Is(err, os.ErrNotExist) {
			return false, unavailable("Kogen's Claude Code at " + p + " is a dangling symlink; remove " + RuntimeDir(home) + " and run again")
		}
		if err != nil {
			return false, unavailable("cannot inspect " + p + ": " + err.Error())
		}
	}
	kind := ""
	switch {
	case info.IsDir():
		kind = "a directory"
	case !info.Mode().IsRegular():
		kind = "not a regular file"
	case info.Size() == 0:
		kind = "empty"
	case info.Mode().Perm()&0o111 == 0:
		kind = "not executable"
	}
	if kind != "" {
		return false, unavailable("Kogen's Claude Code at " + p + " is " + kind + "; remove " + RuntimeDir(home) + " and run again")
	}
	return true, nil
}

// ensureRuntime makes the pinned runtime and Kogen's configuration directory exist before the
// first child of a role start, installing the runtime when it is not there.
func (a *adapter) ensureRuntime(ctx context.Context) error {
	if _, ok := pinFor(a.goos, a.goarch); !ok {
		return unavailable(UnsupportedMessage(a.goos, a.goarch))
	}
	if a.opts.Home == "" {
		return unavailable("cannot locate your home directory for Kogen's Claude Code runtime")
	}
	root := Root(a.opts.Home)
	for _, dir := range []string{root, ConfigDir(a.opts.Home)} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return unavailable("cannot create " + dir + ": " + err.Error())
		}
		if dir != root {
			info, err := os.Lstat(dir)
			if err != nil {
				return unavailable("cannot secure " + dir + ": " + err.Error())
			}
			if info.Mode()&os.ModeSymlink != 0 {
				continue
			}
		}
		if err := os.Chmod(dir, 0o700); err != nil {
			return unavailable("cannot secure " + dir + ": " + err.Error())
		}
	}
	if present, err := runtimeUsable(a.opts.Home); err != nil || present {
		return err
	}
	return a.install(ctx)
}

// install downloads, verifies and installs the pinned runtime under the install lock.
func (a *adapter) install(ctx context.Context) error {
	want, _ := pinFor(a.goos, a.goarch)
	origin, seam, err := seamOrigin()
	if err != nil {
		return err
	}
	base := downloadBase
	if seam {
		base = origin
	}
	root := Root(a.opts.Home)
	lock, err := lockInstall(ctx, filepath.Join(root, "install.lock"), a.stderr())
	if err != nil {
		return err
	}
	defer lock.Close()
	// Leftovers of interrupted installations; no other installation runs while the lock is held.
	leftovers, _ := filepath.Glob(filepath.Join(root, ".partial-*"))
	for _, p := range leftovers {
		if err := os.RemoveAll(p); err != nil {
			return unavailable("cannot remove the unfinished installation " + p + ": " + err.Error())
		}
	}
	if present, err := runtimeUsable(a.opts.Home); err != nil || present {
		return err
	}
	partial, err := os.MkdirTemp(root, ".partial-")
	if err != nil {
		return unavailable("cannot create an installation directory in " + root + ": " + err.Error())
	}
	installed := false
	defer func() {
		if !installed {
			os.RemoveAll(partial)
		}
	}()
	fmt.Fprintf(a.stderr(), "kogen: installing Claude Code %s into %s\n", Version, RuntimeDir(a.opts.Home))

	if seam {
		manifestURL := base + "/" + Version + "/manifest.json"
		checksum, size, err := a.fetchManifest(ctx, manifestURL, want.platform)
		if err != nil {
			return err
		}
		want.sha256, want.size = checksum, size
	}
	source := base + "/" + Version + "/" + want.platform + "/claude"
	file := filepath.Join(partial, "claude")
	var digest string
	for attempt := 1; attempt <= downloadAttempts; attempt++ {
		var retry bool
		digest, retry, err = a.downloadBinary(ctx, source, file, want)
		if ctx.Err() != nil {
			return classify(ctx)
		}
		if err == nil {
			break
		}
		if !retry {
			return err
		}
		if attempt == downloadAttempts {
			return unavailable(fmt.Sprintf("%s; %d attempts", err.(*sys.Error).Detail, downloadAttempts))
		}
		fmt.Fprintf(a.stderr(), "kogen: download attempt %d failed: %s; retry after pause\n", attempt, err)
		delay := a.downloadRetryDelay
		if delay == 0 {
			delay = downloadRetryDelay
		}
		timer := time.NewTimer(time.Duration(attempt) * delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return classify(ctx)
		case <-timer.C:
		}
	}
	if err := os.Chmod(file, 0o755); err != nil {
		return unavailable("cannot make " + file + " executable: " + err.Error())
	}
	reported, err := a.run(ctx, file, nil, "", "--version")
	if ctx.Err() != nil {
		return classify(ctx)
	}
	if err != nil {
		return unavailable("the downloaded Claude Code does not run: " + err.Error() + "; nothing was installed")
	}
	if answer := strings.TrimSpace(string(reported)); !Pinned(answer) {
		return unavailable("the downloaded Claude Code reports " + answer + ", not " + Version + "; nothing was installed")
	}
	dir := RuntimeDir(a.opts.Home)
	// An empty version directory (no executable in it) is no installation; Rename replaces it.
	if err := os.Rename(partial, dir); err != nil {
		return unavailable("cannot install Claude Code " + Version + " into " + dir + ": " + err.Error() + "; remove " + dir + " and run again")
	}
	installed = true
	fmt.Fprintf(a.stderr(), "kogen: installed Claude Code %s (sha256 %s)\n", Version, digest)
	return nil
}

// downloadBinary performs one clean attempt. Only transport failures and transient
// HTTP responses are retryable; local writes and completed pin mismatches are not.
func (a *adapter) downloadBinary(ctx context.Context, source, file string, want pin) (string, bool, error) {
	fail := func(detail string) error {
		return unavailable("cannot download Claude Code " + Version + " from " + source + ": " + detail)
	}
	downloadCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	req, err := http.NewRequestWithContext(downloadCtx, http.MethodGet, source, nil)
	if err != nil {
		return "", false, fail(err.Error())
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err
		}
		return "", true, fail(err.Error())
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", resp.StatusCode == 429 || resp.StatusCode >= 500 && resp.StatusCode <= 599, fail("HTTP " + resp.Status)
	}
	out, err := os.OpenFile(file, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o700)
	if err != nil {
		return "", false, unavailable("cannot create " + file + ": " + err.Error())
	}
	idle := a.downloadIdle
	if idle == 0 {
		idle = downloadIdleTimeout
	}
	reader := newIdleReader(resp.Body, idle, cancel)
	hash := sha256.New()
	writer := &downloadWriter{w: io.MultiWriter(out, hash)}
	n, copyErr := io.Copy(writer, io.LimitReader(reader, want.size+1))
	stalled := reader.stop()
	closeErr := out.Close()
	if ctx.Err() != nil {
		return "", false, classify(ctx)
	}
	if stalled {
		return "", false, fail("connection stalled")
	}
	if writer.err != nil {
		return "", false, fail(writer.err.Error())
	}
	if closeErr != nil {
		return "", false, fail(closeErr.Error())
	}
	if copyErr != nil {
		return "", true, fail(copyErr.Error())
	}
	digest := hex.EncodeToString(hash.Sum(nil))
	if n != want.size || digest != want.sha256 {
		return "", false, unavailable("the downloaded Claude Code " + Version + " does not match its pinned SHA-256; nothing was installed")
	}
	return digest, false, nil
}

type downloadWriter struct {
	w   io.Writer
	err error
}

func (w *downloadWriter) Write(p []byte) (int, error) {
	n, err := w.w.Write(p)
	w.err = err
	return n, err
}

// idleReader cancels the request when no body bytes arrive for an idle interval.
type idleReader struct {
	io.Reader
	mu               sync.Mutex
	timer            *time.Timer
	last             time.Time
	interval         time.Duration
	cancel           context.CancelFunc
	stopped, stalled bool
}

func newIdleReader(r io.Reader, interval time.Duration, cancel context.CancelFunc) *idleReader {
	b := &idleReader{Reader: r, interval: interval, cancel: cancel, last: time.Now()}
	b.timer = time.AfterFunc(interval, b.expire)
	return b
}
func (b *idleReader) expire() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.stopped {
		return
	}
	if remaining := b.interval - time.Since(b.last); remaining > 0 {
		b.timer.Reset(remaining)
		return
	}
	b.stalled = true
	b.cancel()
}
func (b *idleReader) Read(p []byte) (int, error) {
	n, err := b.Reader.Read(p)
	if n > 0 {
		b.mu.Lock()
		if !b.stalled && !b.stopped {
			b.last = time.Now()
			b.timer.Reset(b.interval)
		}
		b.mu.Unlock()
	}
	return n, err
}
func (b *idleReader) stop() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.stopped = true
	b.timer.Stop()
	return b.stalled
}

// get is one HTTP GET with no timeout of its own; anything but 200 is a refusal.
func (a *adapter) get(ctx context.Context, source string) (*http.Response, error) {
	fail := func(detail string) error {
		return unavailable("cannot download Claude Code " + Version + " from " + source + ": " + detail)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, fail(err.Error())
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, classify(ctx)
		}
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err
		}
		return nil, fail(err.Error())
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fail("HTTP " + resp.Status)
	}
	return resp, nil
}

// fetchManifest reads the official manifest shape from the test seam.
func (a *adapter) fetchManifest(ctx context.Context, source, platform string) (checksum string, size int64, err error) {
	resp, err := a.get(ctx, source)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	var m struct {
		Platforms map[string]struct {
			Checksum string `json:"checksum"`
			Size     int64  `json:"size"`
		} `json:"platforms"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&m); err != nil {
		if ctx.Err() != nil {
			return "", 0, classify(ctx)
		}
		return "", 0, unavailable("cannot download Claude Code " + Version + " from " + source + ": " + err.Error())
	}
	p := m.Platforms[platform]
	if !checksumRe.MatchString(p.Checksum) || p.Size <= 0 {
		return "", 0, unavailable("cannot download Claude Code " + Version + " from " + source + ": no checksum and size for " + platform)
	}
	return p.Checksum, p.Size, nil
}

// lockInstall takes the exclusive lock on path, waiting for another Kogen's installation.
func lockInstall(ctx context.Context, path string, stderr io.Writer) (*os.File, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, unavailable("cannot open the install lock " + path + ": " + err.Error())
	}
	noticed := false
	for {
		err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			return f, nil
		}
		if err != syscall.EWOULDBLOCK && err != syscall.EINTR {
			f.Close()
			return nil, unavailable("cannot lock " + path + ": " + err.Error())
		}
		if err == syscall.EWOULDBLOCK && !noticed {
			fmt.Fprint(stderr, "kogen: another Claude Code installation is in progress; waiting\n")
			noticed = true
		}
		select {
		case <-ctx.Done():
			f.Close()
			return nil, classify(ctx)
		case <-time.After(50 * time.Millisecond):
		}
	}
}

func (a *adapter) stderr() io.Writer {
	if a.opts.Stderr != nil {
		return a.opts.Stderr
	}
	return os.Stderr
}

// Probe runs a no-model-call subcommand (--version, auth status --json) of the managed runtime
// with the child environment, installing nothing.
func Probe(ctx context.Context, home string, args ...string) ([]byte, error) {
	a := New(Options{Home: home}).(*adapter)
	bin, err := a.binary()
	if err != nil {
		return nil, err
	}
	return a.run(ctx, bin, nil, a.opts.Token, args...)
}
