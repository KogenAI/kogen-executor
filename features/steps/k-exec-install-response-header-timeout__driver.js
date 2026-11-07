const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

// The Go capture test is compiled into executor/claudecode through a go test overlay only;
// no file is written into the checkout. It never fails on product behavior: it reports.
const source = String.raw`package claudecode

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

type intentHeaderStderr struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (w *intentHeaderStderr) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.b.Write(p)
}

func TestIntentHeaderTimeoutCapture(t *testing.T) {
	mode := os.Getenv("INTENT_HEADER_MODE")
	home := t.TempDir()
	binary := []byte("#!/bin/sh\necho '" + Version + " (Claude Code)'\n")
	digest := sha256.Sum256(binary)
	var binaryRequests, manifestRequests atomic.Int32
	var mu sync.Mutex
	hung := []int64{}
	var hangs sync.WaitGroup
	// hang accepts the request and never completes the response headers; it records how long
	// the client kept the connection open.
	hang := func(w http.ResponseWriter, prefix string) {
		c, buf, err := w.(http.Hijacker).Hijack()
		if err != nil {
			panic(err)
		}
		hangs.Add(1)
		start := time.Now()
		if prefix != "" {
			buf.WriteString(prefix)
			buf.Flush()
		}
		go func() {
			defer hangs.Done()
			io.Copy(io.Discard, buf)
			c.Close()
			mu.Lock()
			hung = append(hung, time.Since(start).Milliseconds())
			mu.Unlock()
		}()
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/" + Version + "/manifest.json":
			manifestRequests.Add(1)
			if mode == "manifest-silent" {
				hang(w, "")
				return
			}
			fmt.Fprintf(w, "{\"version\":%q,\"platforms\":{\"linux-x64\":{\"binary\":\"claude\",\"checksum\":%q,\"size\":%d}}}", Version, hex.EncodeToString(digest[:]), len(binary))
		case "/" + Version + "/linux-x64/claude":
			n := binaryRequests.Add(1)
			switch {
			case mode == "silent" || mode == "deadline" || mode == "silent-once" && n == 1:
				hang(w, "")
				return
			case mode == "partial-headers":
				hang(w, fmt.Sprintf("HTTP/1.1 200 OK\r\nContent-Length: %d\r\n", len(binary)))
				return
			case mode == "503":
				w.WriteHeader(http.StatusServiceUnavailable)
				return
			case mode == "404":
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Length", fmt.Sprint(len(binary)))
			if mode == "slow-body" {
				// Headers and the first chunk at once, then gaps longer than the header bound
				// and shorter than the idle bound.
				w.WriteHeader(http.StatusOK)
				for i := 0; i < 4; i++ {
					w.Write(binary[i*len(binary)/4 : (i+1)*len(binary)/4])
					w.(http.Flusher).Flush()
					if i < 3 {
						select {
						case <-r.Context().Done():
							return
						case <-time.After(400 * time.Millisecond):
						}
					}
				}
				return
			}
			w.Write(binary)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv(SeamEnv, server.URL)

	stderr := &intentHeaderStderr{}
	a := New(Options{Home: home, Stderr: stderr}).(*adapter)
	a.goos, a.goarch = "linux", "amd64"
	a.setDownloadIdleTimeoutForTest(2 * time.Second)
	a.setDownloadRetryDelayForTest(50 * time.Millisecond)
	bound, timeout := 300*time.Millisecond, 8*time.Second
	if mode == "deadline" {
		bound, timeout = 5*time.Second, 400*time.Millisecond
	}
	// An optional interface keeps the unchanged tree compilable: without the seam the silent
	// origins run into the caller deadline instead of failing compilation.
	seam, hasSeam := any(a).(interface{ setDownloadHeaderTimeoutForTest(time.Duration) })
	if hasSeam {
		seam.setDownloadHeaderTimeoutForTest(bound)
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	started := time.Now()
	err := a.ensureRuntime(ctx)
	elapsed := time.Since(started).Milliseconds()
	done := make(chan struct{})
	go func() { hangs.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
	}

	partial, _ := filepath.Glob(filepath.Join(Root(home), ".partial-*"))
	lockFree := false
	if f, err := os.OpenFile(filepath.Join(Root(home), "install.lock"), os.O_RDWR, 0o600); err == nil {
		lockFree = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) == nil
		f.Close()
	}
	installed, _ := os.ReadFile(RuntimePath(home))
	detail := ""
	if err != nil {
		detail = err.Error()
	}
	stderr.mu.Lock()
	text := stderr.b.String()
	stderr.mu.Unlock()
	mu.Lock()
	hungMs := append([]int64{}, hung...)
	mu.Unlock()
	report := map[string]any{
		"mode": mode, "seam": hasSeam, "error": detail, "stderr": text,
		"binaryRequests": binaryRequests.Load(), "manifestRequests": manifestRequests.Load(),
		"hungMs": hungMs, "elapsedMs": elapsed, "partials": len(partial), "lockFree": lockFree,
		"installed": bytes.Equal(installed, binary),
		"binaryURL":   server.URL + "/" + Version + "/linux-x64/claude",
		"manifestURL": server.URL + "/" + Version + "/manifest.json",
	}
	raw, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("INTENT_HEADER_RESULT"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;

const TEST = 'TestIntentHeaderTimeoutCapture';

// run executes the capture test against one synthetic origin mode and returns its report.
function run(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-header-'));
  try {
    const target = path.resolve('executor/claudecode/intent_header_timeout_capture_test.go');
    const fixture = path.join(root, 'capture_test.go');
    const result = path.join(root, 'result.json');
    const overlay = path.join(root, 'overlay.json');
    fs.writeFileSync(fixture, source);
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[target]: fixture}}));
    const args = ['test', '-overlay', overlay, './executor/claudecode', '-run', `^${TEST}$`, '-count=1', '-timeout=60s'];
    const proc = cp.spawnSync('go', args, {encoding: 'utf8', env: {...process.env, INTENT_HEADER_MODE: mode, INTENT_HEADER_RESULT: result}, timeout: 110000});
    const command = `go test ./executor/claudecode -run ^${TEST}$ (mode ${mode})`;
    assert.equal(proc.status, 0, `${TEST}: ${command} exited ${proc.status}: ${proc.error || ''}\n${proc.stdout}${proc.stderr}`);
    assert.ok(fs.existsSync(result), `${TEST}: ${command} passed but wrote no report: the test was absent, skipped or ran zero times\n${proc.stdout}`);
    return JSON.parse(fs.readFileSync(result, 'utf8'));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

// observe derives the judged facts from a raw report.
function observe(r) {
  const reason = r.error === '' ? 'installed' : ((r.error.match(/^executor\/([a-z]+):/) || [])[1] || 'other');
  const retryLines = r.stderr.split('\n').filter((line) => /retry/i.test(line));
  return {
    outcome: reason,
    binaryRequests: r.binaryRequests,
    manifestRequests: r.manifestRequests,
    retryLines: retryLines.length,
    retryNoAnswer: retryLines.length > 0 && retryLines.every((line, i) => line.includes(`attempt ${i + 1}`) && line.includes('did not answer')),
    names: r.error.includes(r.binaryURL) ? 'binary' : r.error.includes(r.manifestURL) ? 'manifest' : 'none',
    noAnswer: r.error.includes('did not answer'),
    attempts3: r.error.includes('3 attempts'),
    http: (r.error.match(/HTTP \d{3}/) || [null])[0],
    hung: r.hungMs.length,
    hungWithinBound: r.hungMs.length > 0 && r.hungMs.every((ms) => ms >= 200 && ms <= 1500),
  };
}

// verify judges a report against one row's expectation. The seam is checked last so the
// rows whose behavior is unchanged still show their other observations on the old tree.
function verify(r, want) {
  const got = observe(r);
  const context = `${TEST} mode ${r.mode}: ${JSON.stringify(r)}`;
  for (const [key, value] of Object.entries(want)) {
    if (key === 'maxElapsedMs') assert.ok(r.elapsedMs <= value, `elapsedMs ${r.elapsedMs} exceeds ${value}; ${context}`);
    else if (key === 'minElapsedMs') assert.ok(r.elapsedMs >= value, `elapsedMs ${r.elapsedMs} is below ${value}; ${context}`);
    else assert.deepEqual(got[key], value, `${key}: got ${JSON.stringify(got[key])}, want ${JSON.stringify(value)}; ${context}`);
  }
  assert.equal(r.partials, 0, `a .partial-* directory remains; ${context}`);
  assert.equal(r.lockFree, true, `install.lock cannot be taken at once; ${context}`);
  assert.equal(r.installed, got.outcome === 'installed', `installed runtime bytes do not match the outcome; ${context}`);
  assert.equal(r.seam, true, `the adapter has no setDownloadHeaderTimeoutForTest(time.Duration) seam; ${context}`);
}

// namedBound checks the named production default in runtime.go's source text.
function namedBound(text, name, seconds) {
  const re = new RegExp(`(^|\\n)\\s*(const\\s+)?${name}\\s*=\\s*${seconds} \\* time\\.Second\\s*(\\n|$)`);
  assert.ok(re.test(text), `runtime.go must declare the named constant ${name} = ${seconds} * time.Second`);
}

module.exports = {run, verify, namedBound};

// Observer controls: known-good reports are accepted, every single mutation is rejected.
if (require.main === module) {
  const base = 'http://127.0.0.1:4000/2.1.318';
  const binaryURL = `${base}/linux-x64/claude`;
  const manifestURL = `${base}/manifest.json`;
  const retry = (n, cause) => `kogen: download attempt ${n} failed: executor/unavailable: cannot download Claude Code 2.1.318 from ${binaryURL}: ${cause}; retry after pause\n`;
  const report = (o) => ({mode: 'x', seam: true, error: '', stderr: '', binaryRequests: 1, manifestRequests: 1, hungMs: [], elapsedMs: 100, partials: 0, lockFree: true, installed: false, binaryURL, manifestURL, ...o});
  const cases = [
    [report({mode: 'silent', error: `executor/unavailable: cannot download Claude Code 2.1.318 from ${binaryURL}: the server did not answer; 3 attempts`, stderr: retry(1, 'the server did not answer') + retry(2, 'the server did not answer'), binaryRequests: 3, hungMs: [301, 302, 300], elapsedMs: 1100}),
      {outcome: 'unavailable', binaryRequests: 3, manifestRequests: 1, retryLines: 2, retryNoAnswer: true, names: 'binary', noAnswer: true, attempts3: true, hung: 3, hungWithinBound: true, maxElapsedMs: 3000}],
    [report({mode: 'silent-once', stderr: 'kogen: installing\n' + retry(1, 'the server did not answer') + 'kogen: installed\n', binaryRequests: 2, hungMs: [301], elapsedMs: 400, installed: true}),
      {outcome: 'installed', binaryRequests: 2, manifestRequests: 1, retryLines: 1, retryNoAnswer: true, hung: 1, hungWithinBound: true, maxElapsedMs: 3000}],
    [report({mode: 'slow-body', elapsedMs: 1250, installed: true}),
      {outcome: 'installed', binaryRequests: 1, manifestRequests: 1, retryLines: 0, hung: 0, minElapsedMs: 1000, maxElapsedMs: 5000}],
    [report({mode: 'manifest-silent', error: `executor/unavailable: cannot download Claude Code 2.1.318 from ${manifestURL}: the server did not answer`, binaryRequests: 0, hungMs: [300]}),
      {outcome: 'unavailable', binaryRequests: 0, manifestRequests: 1, retryLines: 0, names: 'manifest', noAnswer: true, attempts3: false, hung: 1, hungWithinBound: true, maxElapsedMs: 3000}],
    [report({mode: '503', error: `executor/unavailable: cannot download Claude Code 2.1.318 from ${binaryURL}: HTTP 503 Service Unavailable; 3 attempts`, stderr: retry(1, 'HTTP 503 Service Unavailable') + retry(2, 'HTTP 503 Service Unavailable'), binaryRequests: 3}),
      {outcome: 'unavailable', binaryRequests: 3, manifestRequests: 1, retryLines: 2, retryNoAnswer: false, names: 'binary', noAnswer: false, http: 'HTTP 503', attempts3: true, hung: 0, maxElapsedMs: 3000}],
  ];
  const mutations = (r) => [
    {seam: false}, {partials: 1}, {lockFree: false}, {installed: !r.installed},
    {binaryRequests: r.binaryRequests + 1}, {manifestRequests: r.manifestRequests + 1},
    {elapsedMs: 9000}, {hungMs: [...r.hungMs, 5000]},
    {stderr: r.stderr + retry(9, 'other')},
    {error: r.error === '' ? 'executor/unavailable: failed' : r.error.replace('executor/unavailable', 'executor/deadline')},
    ...(r.error.includes('did not answer') ? [{error: r.error.replace('did not answer', 'stalled')}] : []),
    ...(r.error.includes(r.binaryURL) ? [{error: r.error.replace(r.binaryURL, 'elsewhere')}] : []),
    ...(r.error.includes(r.manifestURL) ? [{error: r.error.replace(r.manifestURL, 'elsewhere')}, {error: r.error + '; 3 attempts'}] : []),
    ...(r.error.includes('3 attempts') ? [{error: r.error.replace('; 3 attempts', '')}] : []),
    ...(r.error.includes('HTTP 503') ? [{error: r.error.replace('HTTP 503 Service Unavailable', 'the server did not answer')}] : []),
    ...(r.stderr.includes('did not answer') ? [{stderr: r.stderr.replace('did not answer', 'stalled')}] : []),
    ...(r.hungMs.length > 0 ? [{hungMs: r.hungMs.map(() => 50)}] : []),
    ...(r.mode === 'slow-body' ? [{elapsedMs: 400}] : []),
  ];
  const textFixture = 'const downloadIdleTimeout = 30 * time.Second\nconst downloadHeaderTimeout = 30 * time.Second\n';
  if (process.argv[2] === 'good') {
    for (const [r, want] of cases) verify(r, want);
    namedBound(textFixture, 'downloadHeaderTimeout', 30);
    console.log('observer accepted');
  } else if (process.argv[2] === 'bad') {
    const bad = [];
    for (const [r, want] of cases) for (const m of mutations(r)) bad.push([{...r, ...m}, want, JSON.stringify(m)]);
    for (const [r, want, label] of bad) {
      let rejected = false;
      try { verify(r, want); } catch { rejected = true; }
      if (!rejected) { console.log(`observer missed ${r.mode} ${label}`); process.exit(0); }
    }
    for (const text of ['', 'const downloadIdleTimeout = 30 * time.Second\n', 'const downloadHeaderTimeout = 10 * time.Second\n']) {
      let rejected = false;
      try { namedBound(text, 'downloadHeaderTimeout', 30); } catch { rejected = true; }
      if (!rejected) { console.log('observer missed constant'); process.exit(0); }
    }
    console.log('observer rejected all mutations');
    process.exitCode = 1;
  }
}
