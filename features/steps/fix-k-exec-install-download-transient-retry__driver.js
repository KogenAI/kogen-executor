const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

// The Go capture test is compiled into executor/claudecode through a go test overlay only;
// no file is written into the checkout. It replaces http.DefaultClient with a scripted
// transport, runs ensureRuntime under recover and never fails on product behavior: it reports.
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
	"sort"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

type intentDownloadPolicyStderr struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (w *intentDownloadPolicyStderr) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.b.Write(p)
}

// intentDownloadPolicyRequest is one request the transport saw: its path, sorted header
// names and User-Agent.
type intentDownloadPolicyRequest map[string]any

// intentDownloadPolicyBody delivers its data, then fails like a reset connection.
type intentDownloadPolicyBody struct{ data []byte }

func (b *intentDownloadPolicyBody) Read(p []byte) (int, error) {
	if len(b.data) > 0 {
		n := copy(p, b.data)
		b.data = b.data[n:]
		return n, nil
	}
	return 0, errors.New("intent fixture: connection reset by peer")
}

func (b *intentDownloadPolicyBody) Close() error { return nil }

type intentDownloadPolicyTransport struct {
	mode   string
	binary []byte
	mu     sync.Mutex
	seen   []intentDownloadPolicyRequest
}

func (t *intentDownloadPolicyTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	names := []string{}
	for k := range r.Header {
		names = append(names, k)
	}
	sort.Strings(names)
	t.mu.Lock()
	t.seen = append(t.seen, intentDownloadPolicyRequest{"path": r.URL.Path, "headerNames": names, "userAgent": r.Header.Get("User-Agent")})
	t.mu.Unlock()
	answer := func(code int, body io.ReadCloser, n int64, header http.Header) *http.Response {
		if header == nil {
			header = http.Header{}
		}
		return &http.Response{StatusCode: code, Status: fmt.Sprintf("%d %s", code, http.StatusText(code)), Proto: "HTTP/1.1", ProtoMajor: 1, ProtoMinor: 1,
			Header: header, Body: body, ContentLength: n, Request: r}
	}
	text := func(code int, s string) *http.Response {
		return answer(code, io.NopCloser(strings.NewReader(s)), int64(len(s)), nil)
	}
	moved := func(to string) *http.Response {
		return answer(http.StatusFound, http.NoBody, 0, http.Header{"Location": {to}})
	}
	manifest := func() *http.Response {
		digest := sha256.Sum256(t.binary)
		return text(http.StatusOK, fmt.Sprintf("{\"version\":%q,\"platforms\":{\"linux-x64\":{\"binary\":\"claude\",\"checksum\":%q,\"size\":%d}}}", Version, hex.EncodeToString(digest[:]), len(t.binary)))
	}
	switch r.URL.Path {
	case "/" + Version + "/manifest.json":
		if t.mode == "redirect" {
			return moved("/moved/manifest.json"), nil
		}
		return manifest(), nil
	case "/moved/manifest.json":
		return manifest(), nil
	case "/" + Version + "/linux-x64/claude":
		switch t.mode {
		case "http-503":
			return text(http.StatusServiceUnavailable, "unavailable"), nil
		case "http-429":
			return text(http.StatusTooManyRequests, "slow down"), nil
		case "transport-error":
			return nil, errors.New("intent fixture: connection refused")
		case "body-error":
			half := append([]byte(nil), t.binary[:len(t.binary)/2]...)
			return answer(http.StatusOK, &intentDownloadPolicyBody{data: half}, int64(len(t.binary)), nil), nil
		case "silent-headers":
			select {
			case <-r.Context().Done():
			case <-time.After(5 * time.Second):
			}
			return nil, errors.New("intent fixture: no response")
		case "redirect":
			return moved("/moved/linux-x64/claude"), nil
		}
	case "/moved/linux-x64/claude":
		return text(http.StatusOK, string(t.binary)), nil
	}
	return nil, errors.New("intent fixture: unexpected request " + r.URL.String())
}

func TestIntentDownloadPolicyCapture(t *testing.T) {
	mode := os.Getenv("INTENT_DOWNLOAD_POLICY_MODE")
	home := t.TempDir()
	binary := []byte("#!/bin/sh\necho '" + Version + " (Claude Code)'\n")
	tr := &intentDownloadPolicyTransport{mode: mode, binary: binary}
	old := http.DefaultClient
	http.DefaultClient = &http.Client{Transport: tr}
	defer func() { http.DefaultClient = old }()
	origin := "http://127.0.0.1:9"
	t.Setenv(SeamEnv, origin)

	stderr := &intentDownloadPolicyStderr{}
	a := New(Options{Home: home, Stderr: stderr}).(*adapter)
	a.goos, a.goarch = "linux", "amd64"
	a.setDownloadIdleTimeoutForTest(2 * time.Second)
	a.setDownloadHeaderTimeoutForTest(200 * time.Millisecond)
	a.setDownloadRetryDelayForTest(10 * time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var err error
	panicked := ""
	func() {
		defer func() {
			if p := recover(); p != nil {
				panicked = fmt.Sprint(p)
			}
		}()
		err = a.ensureRuntime(ctx)
	}()

	partial, _ := filepath.Glob(filepath.Join(Root(home), ".partial-*"))
	lockFree := false
	if f, err := os.OpenFile(filepath.Join(Root(home), "install.lock"), os.O_RDWR, 0o600); err == nil {
		lockFree = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) == nil
		f.Close()
	}
	installed, _ := os.ReadFile(RuntimePath(home))
	detail, kind := "", "none"
	if err != nil {
		detail, kind = err.Error(), "untyped"
		var se *sys.Error
		if errors.As(err, &se) {
			kind = se.Class + "/" + se.Reason
		}
	}
	stderr.mu.Lock()
	text := stderr.b.String()
	stderr.mu.Unlock()
	tr.mu.Lock()
	seen := append([]intentDownloadPolicyRequest{}, tr.seen...)
	tr.mu.Unlock()
	report := map[string]any{
		"mode": mode, "panic": panicked, "kind": kind, "error": detail, "stderr": text,
		"requests": seen, "partials": len(partial), "lockFree": lockFree, "installed": bytes.Equal(installed, binary),
		"binaryURL": origin + "/" + Version + "/linux-x64/claude",
	}
	raw, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("INTENT_DOWNLOAD_POLICY_RESULT"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;

const TEST = 'TestIntentDownloadPolicyCapture';

// run executes the capture test against one scripted transport mode and returns its report.
function run(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-download-policy-'));
  try {
    const target = path.resolve('executor/claudecode/intent_download_policy_capture_test.go');
    const fixture = path.join(root, 'capture_test.go');
    const result = path.join(root, 'result.json');
    const overlay = path.join(root, 'overlay.json');
    fs.writeFileSync(fixture, source);
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[target]: fixture}}));
    const args = ['test', '-overlay', overlay, './executor/claudecode', '-run', `^${TEST}$`, '-count=1', '-timeout=60s'];
    const proc = cp.spawnSync('go', args, {encoding: 'utf8', env: {...process.env, INTENT_DOWNLOAD_POLICY_MODE: mode, INTENT_DOWNLOAD_POLICY_RESULT: result}, timeout: 110000});
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
  const prefix = `executor/unavailable: cannot download Claude Code 2.1.318 from ${r.binaryURL}: `;
  const shape = (q) => JSON.stringify([q.headerNames, q.userAgent]);
  const firsts = r.requests.filter((q) => !q.path.startsWith('/moved/'));
  const hops = r.requests.filter((q) => q.path.startsWith('/moved/'));
  return {
    kind: r.kind,
    panic: r.panic,
    detail: r.error.startsWith(prefix) ? r.error.slice(prefix.length) : r.error === '' ? null : `unexpected: ${r.error}`,
    paths: r.requests.map((q) => q.path),
    retryLines: r.stderr.split('\n').filter((line) => /retry/i.test(line)).length,
    sameShape: firsts.length > 0 && new Set(firsts.map(shape)).size === 1 && new Set(hops.map(shape)).size <= 1,
  };
}

// verify judges a report against one row's expectation.
function verify(r, want) {
  const got = observe(r);
  const context = `${TEST} mode ${r.mode}: ${JSON.stringify(r)}`;
  for (const [key, value] of Object.entries(want)) {
    assert.deepEqual(got[key], value, `${key}: got ${JSON.stringify(got[key])}, want ${JSON.stringify(value)}; ${context}`);
  }
  assert.equal(r.partials, 0, `a .partial-* directory remains; ${context}`);
  assert.equal(r.lockFree, true, `install.lock cannot be taken at once; ${context}`);
  assert.equal(r.installed, r.error === '', `installed runtime bytes do not match the outcome; ${context}`);
}

module.exports = {run, verify};

// Observer controls: the reports recorded on unchanged main are accepted, every single
// mutation of them is rejected.
if (require.main === module) {
  const binaryURL = 'http://127.0.0.1:9/2.1.318/linux-x64/claude';
  const manifestPath = '/2.1.318/manifest.json';
  const binaryPath = '/2.1.318/linux-x64/claude';
  const installing = 'kogen: installing Claude Code 2.1.318 into /Users/kogen-runner/work.noindex/scratch/delivery/t1106/go/TestIntentDownloadPolicyCapture2802804938/001/.kogen/claude-code/2.1.318\n';
  const fail = (cause) => `executor/unavailable: cannot download Claude Code 2.1.318 from ${binaryURL}: ${cause}`;
  const retry = (n, cause) => `kogen: download attempt ${n} failed: ${fail(cause)}; retry after pause\n`;
  const request = (p, headerNames = []) => ({headerNames, path: p, userAgent: ''});
  const exhausted = (mode, cause) => [
    {binaryURL, error: fail(`${cause}; 3 attempts`), installed: false, kind: 'executor/unavailable', lockFree: true, mode, panic: '', partials: 0,
      requests: [request(manifestPath), request(binaryPath), request(binaryPath), request(binaryPath)],
      stderr: installing + retry(1, cause) + retry(2, cause)},
    {kind: 'executor/unavailable', panic: '', detail: `${cause}; 3 attempts`, paths: [manifestPath, binaryPath, binaryPath, binaryPath], retryLines: 2, sameShape: true},
  ];
  const cases = [
    exhausted('http-503', 'HTTP 503 Service Unavailable'),
    exhausted('http-429', 'HTTP 429 Too Many Requests'),
    exhausted('transport-error', 'intent fixture: connection refused'),
    exhausted('body-error', 'intent fixture: connection reset by peer'),
    exhausted('silent-headers', 'the server did not answer'),
    [{binaryURL, error: '', installed: true, kind: 'none', lockFree: true, mode: 'redirect', panic: '', partials: 0,
      requests: [request(manifestPath), request('/moved/manifest.json', ['Referer']), request(binaryPath), request('/moved/linux-x64/claude', ['Referer'])],
      stderr: installing + 'kogen: installed Claude Code 2.1.318 (sha256 b9e9cd89c437f300c8f057ea515b19223c6b53643f328cb58bbc04b4b01fe4ea)\n'},
      {kind: 'none', panic: '', detail: null, paths: [manifestPath, '/moved/manifest.json', binaryPath, '/moved/linux-x64/claude'], retryLines: 0, sameShape: true}],
  ];
  const mutations = (r) => {
    const withRequest = (i, q) => r.requests.map((old, j) => (j === i ? q : old));
    const binary = r.requests.findIndex((q) => q.path === binaryPath);
    return [
      {panic: 'interface conversion: error is *errors.errorString, not *sys.Error'},
      {kind: 'untyped'},
      {kind: 'executor/failed'},
      {partials: 1}, {lockFree: false}, {installed: !r.installed},
      {requests: r.requests.slice(0, -1)},
      {requests: [...r.requests, request(binaryPath)]},
      {requests: withRequest(binary, {...r.requests[binary], headerNames: ['User-Agent'], userAgent: 'kogen'})},
      {requests: withRequest(r.requests.length - 1, {...r.requests[r.requests.length - 1], headerNames: r.requests[r.requests.length - 1].headerNames.length ? [] : ['Referer']})},
      {stderr: r.stderr + retry(3, 'other')},
      r.error === '' ? {error: fail('HTTP 302 Found'), installed: false, kind: 'executor/unavailable'} : {error: r.error.replace('; 3 attempts', '')},
      ...(r.error === '' ? [] : [{error: r.error.replace(binaryURL, 'http://127.0.0.1:9/2.1.318/manifest.json')}, {error: '', installed: true, kind: 'none'}]),
    ];
  };
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
