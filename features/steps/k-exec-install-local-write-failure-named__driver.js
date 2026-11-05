const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
const feature = '.kogen/intents/k-exec-install-local-write-failure-named/acceptance.feature';
function verify(got, want) {
  for (const [key, value] of Object.entries(want)) assert.deepEqual(got[key], value, `${key}: got ${JSON.stringify(got)}`);
}
// The capture installs a 4096-byte runtime (a shell script answering --version) from a local
// origin through ensureRuntime, injects one local or network fault, and records what the
// installer, its sync calls and the origin observed.
const source = String.raw`package claudecode

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

// localWriteIntentPartialSize is the largest partial runtime file present, or -1.
func localWriteIntentPartialSize(root string) int64 {
	var max int64 = -1
	files, _ := filepath.Glob(filepath.Join(root, ".partial-*", "claude"))
	for _, f := range files {
		if info, err := os.Stat(f); err == nil && info.Mode().IsRegular() && info.Size() > max {
			max = info.Size()
		}
	}
	return max
}

var localWriteIntentPartial = regexp.MustCompile(` + "`" + String.raw`\.partial-[^/:\s]+` + "`" + String.raw`)
var localWriteIntentAddr = regexp.MustCompile(` + "`" + String.raw`127\.0\.0\.1:[0-9]+` + "`" + String.raw`)

func TestIntentLocalWriteCapture(t *testing.T) {
	mode := os.Getenv("INTENT_LOCAL_WRITE_MODE")
	home := t.TempDir()
	root := Root(home)
	head := "#!/bin/sh\necho '" + Version + " (Claude Code)'\n#"
	binary := []byte(head + strings.Repeat("#", 4096-len(head)-1) + "\n")
	digest := sha256.Sum256(binary)
	sum := hex.EncodeToString(digest[:])
	var limit syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_FSIZE, &limit); err != nil {
		t.Fatal(err)
	}
	restore := func() { l := limit; syscall.Setrlimit(syscall.RLIMIT_FSIZE, &l) }
	defer restore()
	var requests atomic.Int32
	var writtenBeforeLimit atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/" + Version + "/manifest.json":
			if mode == "create" {
				// A directory where the partial file belongs makes its creation fail locally.
				dirs, _ := filepath.Glob(filepath.Join(root, ".partial-*"))
				for _, d := range dirs {
					os.Mkdir(filepath.Join(d, "claude"), 0o700)
				}
			}
			w.Header().Set("Connection", "close")
			manifest, _ := json.Marshal(map[string]any{"version": Version, "platforms": map[string]any{"linux-x64": map[string]any{"binary": "claude", "checksum": sum, "size": len(binary)}}})
			w.Write(manifest)
			return
		case "/" + Version + "/linux-x64/claude":
		default:
			http.NotFound(w, r)
			return
		}
		n := requests.Add(1)
		switch {
		case mode == "write":
			// After the first half reached the partial file, the process may write no file
			// past 1024 bytes, so the next write of the partial file fails locally.
			w.Header().Set("Content-Length", fmt.Sprint(len(binary)))
			w.WriteHeader(200)
			w.Write(binary[:2048])
			w.(http.Flusher).Flush()
			for deadline := time.Now().Add(5 * time.Second); time.Now().Before(deadline); time.Sleep(5 * time.Millisecond) {
				if localWriteIntentPartialSize(root) >= 2048 {
					writtenBeforeLimit.Store(true)
					break
				}
			}
			l := limit
			l.Cur = 1024
			syscall.Setrlimit(syscall.RLIMIT_FSIZE, &l)
			w.Write(binary[2048:])
			w.(http.Flusher).Flush()
		case mode == "reset" || mode == "reset-once" && n == 1:
			c, buf, err := w.(http.Hijacker).Hijack()
			if err != nil {
				panic(err)
			}
			fmt.Fprintf(buf, "HTTP/1.1 200 OK\r\nContent-Length: %d\r\n\r\n", len(binary))
			buf.Write(binary[:2048])
			buf.Flush()
			time.Sleep(50 * time.Millisecond)
			if tc, ok := c.(*net.TCPConn); ok {
				tc.SetLinger(0)
			}
			c.Close()
		default:
			w.Header().Set("Content-Length", fmt.Sprint(len(binary)))
			w.Write(binary)
		}
	}))
	defer srv.Close()
	t.Setenv(SeamEnv, srv.URL)
	source := srv.URL + "/" + Version + "/linux-x64/claude"
	var mu sync.Mutex
	syncs := []string{}
	var syncedFile os.FileInfo
	hook := func(f *os.File) error {
		info, err := f.Stat()
		_, pubErr := os.Lstat(RuntimeDir(home))
		published := pubErr == nil
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			syncs = append(syncs, "stat failed: "+err.Error())
			return f.Sync()
		}
		if info.IsDir() {
			rootInfo, rootErr := os.Stat(root)
			syncs = append(syncs, fmt.Sprintf("dir root=%t published=%t", rootErr == nil && os.SameFile(info, rootInfo), published))
			if mode == "dir-sync" {
				return errors.New("injected sync failure")
			}
		} else {
			syncs = append(syncs, fmt.Sprintf("file size=%d published=%t", info.Size(), published))
			syncedFile = info
			if mode == "file-sync" {
				return errors.New("injected sync failure")
			}
		}
		return f.Sync()
	}
	var stderr bytes.Buffer
	a := New(Options{Home: home, Stderr: &stderr}).(*adapter)
	a.goos, a.goarch = "linux", "amd64"
	a.setDownloadRetryDelayForTest(10 * time.Millisecond)
	seam := false
	if s, ok := any(a).(interface{ setSyncForTest(func(*os.File) error) }); ok {
		s.setSyncForTest(hook)
		seam = true
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	err := a.ensureRuntime(ctx)
	restore()
	srv.Close()
	norm := func(s string) string {
		s = strings.ReplaceAll(s, source, "{source}")
		s = strings.ReplaceAll(s, home, "{home}")
		s = strings.ReplaceAll(s, sum, "{sha256}")
		s = localWriteIntentPartial.ReplaceAllString(s, ".partial-*")
		return localWriteIntentAddr.ReplaceAllString(s, "{addr}")
	}
	reason, detail := "", ""
	if err != nil {
		if e, ok := sys.AsError(err); ok {
			reason, detail = e.Class+"/"+e.Reason, e.Detail
		} else {
			reason, detail = "not a *sys.Error", err.Error()
		}
	}
	_, dirErr := os.Lstat(RuntimeDir(home))
	partial, _ := filepath.Glob(filepath.Join(root, ".partial-*"))
	runs := ""
	if out, e := exec.Command(RuntimePath(home), "--version").CombinedOutput(); e == nil {
		runs = strings.TrimSpace(string(out))
	}
	installedSynced := false
	if info, e := os.Stat(RuntimePath(home)); e == nil && syncedFile != nil {
		installedSynced = os.SameFile(info, syncedFile)
	}
	mu.Lock()
	result := map[string]any{
		"seam":               seam,
		"requests":           requests.Load(),
		"success":            err == nil,
		"reason":             reason,
		"detail":             norm(detail),
		"stderr":             strings.Split(strings.TrimSuffix(norm(stderr.String()), "\n"), "\n"),
		"runtimeDir":         dirErr == nil,
		"partialCount":       len(partial),
		"runs":               runs,
		"syncs":              syncs,
		"installedSynced":    installedSynced,
		"writtenBeforeLimit": writtenBeforeLimit.Load(),
	}
	mu.Unlock()
	raw, e := json.Marshal(result)
	if e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(os.Getenv("INTENT_LOCAL_WRITE_RESULT"), raw, 0o600); e != nil {
		t.Fatal(e)
	}
}
`;
function run(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-local-write-'));
  try {
    const target = path.resolve('executor/claudecode/intent_local_write_capture_test.go');
    const fixture = path.join(root, 'capture_test.go');
    const result = path.join(root, 'result.json');
    fs.writeFileSync(fixture, source);
    const overlay = path.join(root, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[target]: fixture}}));
    const args = ['test', '-overlay', overlay, './executor/claudecode', '-run', '^TestIntentLocalWriteCapture$', '-count=1', '-timeout=60s'];
    const proc = cp.spawnSync('go', args, {encoding: 'utf8', env: {...process.env, INTENT_LOCAL_WRITE_MODE: mode, INTENT_LOCAL_WRITE_RESULT: result}, timeout: 110000});
    assert.equal(proc.status, 0, `TestIntentLocalWriteCapture (${mode}): go ${args.join(' ')} exited ${proc.status}: ${proc.error || ''}\n${proc.stdout}${proc.stderr}`);
    assert.ok(fs.existsSync(result), `TestIntentLocalWriteCapture (${mode}) absent, skipped or ran zero times: go ${args.join(' ')} wrote no result\n${proc.stdout}`);
    return JSON.parse(fs.readFileSync(result, 'utf8'));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}
module.exports = {run, verify};

function rows() {
  const out = [];
  for (const line of fs.readFileSync(feature, 'utf8').split('\n')) {
    const m = /^\s*\|\s*([a-z-]+)\s*\|\s*(\{.*\})\s*\|\s*$/.exec(line);
    if (m) out.push([m[1], JSON.parse(m[2])]);
  }
  return out;
}
const installing = 'kogen: installing Claude Code 2.1.312 into {home}/.kogen/claude-code/2.1.312';
const installed = 'kogen: installed Claude Code 2.1.312 (sha256 {sha256})';
const resetCause = 'cannot download Claude Code 2.1.312 from {source}: read tcp {addr}->{addr}: read: connection reset by peer';
const retryLine = n => `kogen: download attempt ${n} failed: executor/unavailable: ${resetCause}; retry after pause`;
const fileSync = 'file size=4096 published=false';
const dirSync = 'dir root=true published=true';
const unchanged = {seam: false, syncs: [], installedSynced: false, writtenBeforeLimit: false, reason: '', detail: '', partialCount: 0};
const unchangedOK = {...unchanged, requests: 1, success: true, stderr: [installing, installed], runtimeDir: true, runs: '2.1.312 (Claude Code)'};
// Known-bad results: the unchanged tree's actual results with this capture, and plausible wrong
// implementations (sync at the wrong moment, a published directory left behind, a retried write).
const known = {
  create: [{...unchanged, requests: 1, success: false, reason: 'executor/unavailable', detail: 'cannot create {home}/.kogen/claude-code/.partial-*/claude: open {home}/.kogen/claude-code/.partial-*/claude: is a directory', stderr: [installing], runtimeDir: false, runs: ''}],
  write: [
    {...unchanged, requests: 1, success: false, reason: 'executor/unavailable', detail: 'cannot download Claude Code 2.1.312 from {source}: write {home}/.kogen/claude-code/.partial-*/claude: file too large', stderr: [installing], runtimeDir: false, runs: '', writtenBeforeLimit: true},
    {...unchanged, requests: 3, success: false, reason: 'executor/unavailable', detail: 'local write failure: cannot write {home}/.kogen/claude-code/.partial-*/claude: file too large; nothing was installed', stderr: [installing], runtimeDir: false, runs: '', writtenBeforeLimit: true},
    {...unchanged, requests: 1, success: false, reason: 'executor/unavailable', detail: 'local write failure: cannot write {home}/.kogen/claude-code/.partial-*/claude: file too large; nothing was installed', stderr: [installing], runtimeDir: false, runs: '', writtenBeforeLimit: true, partialCount: 1},
  ],
  'reset-once': [{...unchangedOK, requests: 2, stderr: [installing, retryLine(1), installed]}],
  'file-sync': [{...unchangedOK}, {...unchangedOK, seam: true, success: false, reason: 'executor/unavailable', detail: 'cannot flush {home}/.kogen/claude-code/.partial-*/claude to disk: injected sync failure; nothing was installed', stderr: [installing], syncs: [fileSync], runs: ''}],
  'dir-sync': [{...unchangedOK}, {...unchangedOK, seam: true, success: false, reason: 'executor/unavailable', detail: 'cannot flush {home}/.kogen/claude-code to disk: injected sync failure; nothing was installed', stderr: [installing], syncs: [fileSync, dirSync]}],
  normal: [
    {...unchangedOK},
    {...unchangedOK, seam: true, syncs: [fileSync, 'dir root=true published=false'], installedSynced: true},
    {...unchangedOK, seam: true, syncs: ['file size=4096 published=true', dirSync], installedSynced: true},
    {...unchangedOK, seam: true, syncs: [dirSync], installedSynced: false},
    {...unchangedOK, seam: true, syncs: [fileSync, dirSync], installedSynced: true, stderr: [installing, 'kogen: flushed', installed]},
  ],
};
if (require.main === module) {
  const table = rows();
  if (table.length !== 7) {
    console.log(`expected 7 example rows in ${feature}, found ${table.length}`);
    process.exit(2);
  }
  if (process.argv[2] === 'good') {
    for (const [, want] of table) verify({...want, extra: 'ignored'}, want);
    console.log(`observer accepted ${table.length} rows`);
  } else if (process.argv[2] === 'bad') {
    let count = 0;
    const reject = (mode, got, want, what) => {
      count++;
      try { verify(got, want); } catch { return; }
      console.log(`observer missed ${mode} ${what}`);
      process.exit(0);
    };
    for (const [mode, want] of table) {
      for (const [i, got] of (known[mode] || []).entries()) reject(mode, got, want, `known-bad ${i}`);
      for (const [key, value] of Object.entries(want)) {
        const bad = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : Array.isArray(value) ? [...value, 'x'] : value + 'x';
        reject(mode, {...want, [key]: bad}, want, key);
        if (Array.isArray(value) && value.length > 0) reject(mode, {...want, [key]: value.slice(0, -1)}, want, `short ${key}`);
        const missing = {...want};
        delete missing[key];
        reject(mode, missing, want, `missing ${key}`);
      }
    }
    console.log(`observer rejected ${count} known-bad results`);
    process.exitCode = 1;
  }
}
