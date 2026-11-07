const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

// The Go capture test is compiled into executor/claudecode through a go test overlay only;
// no file is written into the checkout. It replaces http.DefaultClient with a scripted
// transport and never fails on product behavior: it reports.
const source = String.raw`package claudecode

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

type intentLateStallStderr struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (w *intentLateStallStderr) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.b.Write(p)
}

// intentLateStallBody delivers its data first. The read after the data ends the stream: at once
// ("prompt"), or only once the request has been cancelled, then with a clean EOF ("eof") or
// with an error ("error").
type intentLateStallBody struct {
	ctx       context.Context
	data      []byte
	end       string
	cancelled *atomic.Bool
}

func (b *intentLateStallBody) Read(p []byte) (int, error) {
	if len(b.data) > 0 {
		n := copy(p, b.data)
		b.data = b.data[n:]
		return n, nil
	}
	if b.end != "prompt" {
		select {
		case <-b.ctx.Done():
			b.cancelled.Store(true)
		case <-time.After(5 * time.Second):
		}
	}
	if b.end == "error" {
		return 0, errors.New("connection reset by peer")
	}
	return 0, io.EOF
}

func (b *intentLateStallBody) Close() error { return nil }

type intentLateStallTransport struct {
	mode                       string
	binary                     []byte
	binaryRequests, manifests  atomic.Int32
	cancelled                  atomic.Bool
	mu                         sync.Mutex
	hung                       []int64
}

// hang never answers; it records how long the client kept the request open.
func (t *intentLateStallTransport) hang(r *http.Request) (*http.Response, error) {
	start := time.Now()
	select {
	case <-r.Context().Done():
	case <-time.After(5 * time.Second):
	}
	t.mu.Lock()
	t.hung = append(t.hung, time.Since(start).Milliseconds())
	t.mu.Unlock()
	return nil, errors.New("intent fixture: no response")
}

func (t *intentLateStallTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	ok := func(body io.ReadCloser, n int) *http.Response {
		return &http.Response{StatusCode: http.StatusOK, Status: "200 OK", Proto: "HTTP/1.1", ProtoMajor: 1, ProtoMinor: 1,
			Header: http.Header{}, Body: body, ContentLength: int64(n), Request: r}
	}
	switch r.URL.Path {
	case "/" + Version + "/manifest.json":
		t.manifests.Add(1)
		if t.mode == "manifest-silent-headers" {
			return t.hang(r)
		}
		digest := sha256.Sum256(t.binary)
		m := fmt.Sprintf("{\"version\":%q,\"platforms\":{\"linux-x64\":{\"binary\":\"claude\",\"checksum\":%q,\"size\":%d}}}", Version, hex.EncodeToString(digest[:]), len(t.binary))
		return ok(io.NopCloser(strings.NewReader(m)), len(m)), nil
	case "/" + Version + "/linux-x64/claude":
		t.binaryRequests.Add(1)
		data, end := t.binary, "eof"
		switch t.mode {
		case "silent-headers":
			return t.hang(r)
		case "late-error":
			end = "error"
		case "short-eof":
			data = t.binary[:len(t.binary)/2]
		case "prompt-eof":
			end = "prompt"
		case "short-prompt":
			data, end = t.binary[:len(t.binary)/2], "prompt"
		}
		return ok(&intentLateStallBody{ctx: r.Context(), data: append([]byte(nil), data...), end: end, cancelled: &t.cancelled}, len(t.binary)), nil
	}
	return nil, errors.New("intent fixture: unexpected request " + r.URL.String())
}

func TestIntentLateStallCapture(t *testing.T) {
	mode := os.Getenv("INTENT_LATE_STALL_MODE")
	home := t.TempDir()
	binary := []byte("#!/bin/sh\necho '" + Version + " (Claude Code)'\n")
	tr := &intentLateStallTransport{mode: mode, binary: binary}
	old := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: tr}
	defer func() { http.DefaultClient = old }()
	origin := "http://127.0.0.1:9"
	t.Setenv(SeamEnv, origin)

	stderr := &intentLateStallStderr{}
	a := New(Options{Home: home, Stderr: stderr}).(*adapter)
	a.goos, a.goarch = "linux", "amd64"
	a.setDownloadIdleTimeoutForTest(200 * time.Millisecond)
	a.setDownloadHeaderTimeoutForTest(200 * time.Millisecond)
	a.setDownloadRetryDelayForTest(10 * time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	started := time.Now()
	err := a.ensureRuntime(ctx)
	elapsed := time.Since(started).Milliseconds()

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
	tr.mu.Lock()
	hungMs := append([]int64{}, tr.hung...)
	tr.mu.Unlock()
	report := map[string]any{
		"mode": mode, "error": detail, "stderr": text,
		"binaryRequests": tr.binaryRequests.Load(), "manifestRequests": tr.manifests.Load(),
		"endAfterCancel": tr.cancelled.Load(), "hungMs": hungMs, "elapsedMs": elapsed,
		"partials": len(partial), "lockFree": lockFree, "installed": bytes.Equal(installed, binary),
		"binaryURL":   origin + "/" + Version + "/linux-x64/claude",
		"manifestURL": origin + "/" + Version + "/manifest.json",
	}
	raw, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("INTENT_LATE_STALL_RESULT"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;

const TEST = 'TestIntentLateStallCapture';

// run executes the capture test against one scripted transport mode and returns its report.
function run(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-late-stall-'));
  try {
    const target = path.resolve('executor/claudecode/intent_late_stall_capture_test.go');
    const fixture = path.join(root, 'capture_test.go');
    const result = path.join(root, 'result.json');
    const overlay = path.join(root, 'overlay.json');
    fs.writeFileSync(fixture, source);
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[target]: fixture}}));
    const args = ['test', '-overlay', overlay, './executor/claudecode', '-run', `^${TEST}$`, '-count=1', '-timeout=60s'];
    const proc = cp.spawnSync('go', args, {encoding: 'utf8', env: {...process.env, INTENT_LATE_STALL_MODE: mode, INTENT_LATE_STALL_RESULT: result}, timeout: 110000});
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
  const retryLines = r.stderr.split('\n').filter((line) => /retry/i.test(line));
  return {
    outcome: r.error === '' ? 'installed' : ((r.error.match(/^executor\/([a-z]+):/) || [])[1] || 'other'),
    binaryRequests: r.binaryRequests,
    manifestRequests: r.manifestRequests,
    endAfterCancel: r.endAfterCancel,
    retryLines: retryLines.length,
    names: r.error.includes(r.binaryURL) ? 'binary' : r.error.includes(r.manifestURL) ? 'manifest' : 'none',
    stalled: r.error.endsWith(': connection stalled'),
    short: r.error.includes('is shorter than its pinned size'),
    noAnswer: r.error.includes('the server did not answer'),
    attempts3: r.error.includes('; 3 attempts'),
    hung: r.hungMs.length,
    hungWithinBound: r.hungMs.length > 0 && r.hungMs.every((ms) => ms >= 150 && ms <= 1500),
  };
}

// verify judges a report against one row's expectation.
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
}

module.exports = {run, verify};

// Observer controls: known-good reports are accepted, every single mutation is rejected.
if (require.main === module) {
  const base = 'http://127.0.0.1:9/2.1.318';
  const binaryURL = `${base}/linux-x64/claude`;
  const manifestURL = `${base}/manifest.json`;
  const fail = (url, detail) => `executor/unavailable: cannot download Claude Code 2.1.318 from ${url}: ${detail}`;
  const retry = (n) => `kogen: download attempt ${n} failed: ${fail(binaryURL, 'the server did not answer')}; retry after pause\n`;
  const installing = 'kogen: installing Claude Code 2.1.318 into /tmp/h/.kogen/claude-code/2.1.318\n';
  const installedLine = 'kogen: installed Claude Code 2.1.318 (sha256 b9e9cd89c437f300c8f057ea515b19223c6b53643f328cb58bbc04b4b01fe4ea)\n';
  const report = (o) => ({mode: 'x', error: '', stderr: installing, binaryRequests: 1, manifestRequests: 1, endAfterCancel: false, hungMs: [], elapsedMs: 10, partials: 0, lockFree: true, installed: false, binaryURL, manifestURL, ...o});
  const stall = {outcome: 'unavailable', binaryRequests: 1, manifestRequests: 1, endAfterCancel: true, retryLines: 0, names: 'binary', stalled: true, short: false, minElapsedMs: 150, maxElapsedMs: 3000};
  const cases = [
    [report({mode: 'late-eof', stderr: installing + installedLine, endAfterCancel: true, elapsedMs: 205, installed: true}),
      {outcome: 'installed', binaryRequests: 1, manifestRequests: 1, endAfterCancel: true, retryLines: 0, stalled: false, minElapsedMs: 150, maxElapsedMs: 3000}],
    [report({mode: 'short-eof', error: fail(binaryURL, 'connection stalled'), endAfterCancel: true, elapsedMs: 201}), stall],
    [report({mode: 'late-error', error: fail(binaryURL, 'connection stalled'), endAfterCancel: true, elapsedMs: 202}), stall],
    [report({mode: 'prompt-eof', stderr: installing + installedLine, elapsedMs: 6, installed: true}),
      {outcome: 'installed', binaryRequests: 1, manifestRequests: 1, endAfterCancel: false, retryLines: 0, stalled: false, maxElapsedMs: 3000}],
    [report({mode: 'short-prompt', error: 'executor/unavailable: the downloaded Claude Code 2.1.318 is shorter than its pinned size: received 19 bytes, expected 39; nothing was installed', elapsedMs: 5}),
      {outcome: 'unavailable', binaryRequests: 1, manifestRequests: 1, endAfterCancel: false, retryLines: 0, stalled: false, short: true, maxElapsedMs: 3000}],
    [report({mode: 'silent-headers', error: fail(binaryURL, 'the server did not answer; 3 attempts'), stderr: installing + retry(1) + retry(2), binaryRequests: 3, hungMs: [200, 201, 200], elapsedMs: 632}),
      {outcome: 'unavailable', binaryRequests: 3, manifestRequests: 1, endAfterCancel: false, retryLines: 2, names: 'binary', noAnswer: true, attempts3: true, stalled: false, hung: 3, hungWithinBound: true, maxElapsedMs: 3000}],
    [report({mode: 'manifest-silent-headers', error: fail(manifestURL, 'the server did not answer'), binaryRequests: 0, hungMs: [201], elapsedMs: 203}),
      {outcome: 'unavailable', binaryRequests: 0, manifestRequests: 1, endAfterCancel: false, retryLines: 0, names: 'manifest', noAnswer: true, attempts3: false, stalled: false, hung: 1, hungWithinBound: true, maxElapsedMs: 3000}],
  ];
  const mutations = (r) => [
    {partials: 1}, {lockFree: false}, {installed: !r.installed},
    {binaryRequests: r.binaryRequests + 1}, {manifestRequests: r.manifestRequests + 1},
    {endAfterCancel: !r.endAfterCancel}, {elapsedMs: 9000},
    {stderr: r.stderr + 'kogen: download attempt 9 failed: other; retry after pause\n'},
    r.error === '' ? {error: fail(binaryURL, 'connection stalled')} : {error: r.error.replace('executor/unavailable', 'executor/deadline')},
    ...(r.error.endsWith('connection stalled') ? [{error: r.error.replace('connection stalled', 'connection reset by peer')}, {error: 'executor/unavailable: the downloaded Claude Code 2.1.318 is shorter than its pinned size: received 19 bytes, expected 39; nothing was installed'}, {error: r.error.replace(binaryURL, 'elsewhere')}, {elapsedMs: 20}] : []),
    ...(r.mode === 'late-eof' ? [{elapsedMs: 20}] : []),
    ...(r.error.includes('shorter') ? [{error: fail(binaryURL, 'connection stalled')}] : []),
    ...(r.error.includes('did not answer') ? [{error: r.error.replace('the server did not answer', 'connection stalled')}, {hungMs: r.hungMs.map(() => 50)}, {hungMs: [...r.hungMs, 5000]}] : []),
    ...(r.error.includes(r.manifestURL) ? [{error: r.error.replace(r.manifestURL, r.binaryURL)}, {error: r.error + '; 3 attempts'}] : []),
    ...(r.error.includes('3 attempts') ? [{error: r.error.replace('; 3 attempts', '')}, {stderr: installing + retry(1)}] : []),
  ];
  if (process.argv[2] === 'good') {
    for (const [r, want] of cases) verify(r, want);
    console.log('observer accepted');
  } else if (process.argv[2] === 'bad') {
    for (const [r, want] of cases) {
      for (const m of mutations(r)) {
        let rejected = false;
        try { verify({...r, ...m}, want); } catch { rejected = true; }
        if (!rejected) { console.log(`observer missed ${r.mode} ${JSON.stringify(m)}`); process.exit(0); }
      }
    }
    console.log('observer rejected all mutations');
    process.exitCode = 1;
  }
}
