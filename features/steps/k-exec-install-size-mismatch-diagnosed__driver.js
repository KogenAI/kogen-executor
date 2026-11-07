const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
const feature = '.kogen/intents/k-exec-install-size-mismatch-diagnosed/acceptance.feature';
function verify(got, want) {
  for (const [key, value] of Object.entries(want)) assert.deepEqual(got[key], value, `${key}: got ${JSON.stringify(got)}`);
}
// The capture installs from a local origin serving a 4096-byte runtime (a shell script answering
// --version) through ensureRuntime, and records what the installer and the origin observed.
const source = String.raw`package claudecode

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

// sizeIntentPartialSize is the largest partial runtime file present, or -1.
func sizeIntentPartialSize(root string) int64 {
	var max int64 = -1
	files, _ := filepath.Glob(filepath.Join(root, ".partial-*", "claude"))
	for _, f := range files {
		if info, err := os.Stat(f); err == nil && info.Size() > max {
			max = info.Size()
		}
	}
	return max
}

func TestIntentSizeMismatchCapture(t *testing.T) {
	mode := os.Getenv("INTENT_SIZE_MODE")
	home := t.TempDir()
	root := Root(home)
	head := "#!/bin/sh\necho '" + Version + " (Claude Code)'\n#"
	binary := []byte(head + strings.Repeat("#", 4096-len(head)-1) + "\n")
	page := []byte("<html>" + strings.Repeat("x", 1024-len("<html></html>")) + "</html>")
	digest := sha256.Sum256(binary)
	sum := hex.EncodeToString(digest[:])
	var requests atomic.Int32
	var closedBeforeBody atomic.Bool
	var maxFile atomic.Int64
	maxFile.Store(-1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/" + Version + "/manifest.json":
			w.Header().Set("Connection", "close")
			manifest, _ := json.Marshal(map[string]any{"version": Version, "platforms": map[string]any{"linux-x64": map[string]any{"binary": "claude", "checksum": sum, "size": len(binary)}}})
			w.Write(manifest)
			return
		case "/" + Version + "/linux-x64/claude":
		default:
			http.NotFound(w, r)
			return
		}
		requests.Add(1)
		switch mode {
		case "page":
			w.WriteHeader(200)
			w.Write(page)
			w.(http.Flusher).Flush()
		case "flipped":
			b := append([]byte{}, binary...)
			b[len(b)-2] ^= 0x01
			w.Header().Set("Content-Length", fmt.Sprint(len(b)))
			w.Write(b)
		case "announced", "announced-longer":
			// The body is withheld until the client closes the connection or 3 s pass.
			body := page
			if mode == "announced-longer" {
				body = bytes.Repeat([]byte("#"), 1<<20)
			}
			w.Header().Set("Content-Length", fmt.Sprint(len(body)))
			w.WriteHeader(200)
			w.(http.Flusher).Flush()
			select {
			case <-r.Context().Done():
				closedBeforeBody.Store(true)
			case <-time.After(3 * time.Second):
				w.Write(body)
			}
		case "chunked-short":
			w.WriteHeader(200)
			w.Write(binary[:2048])
			w.(http.Flusher).Flush()
		case "longer":
			w.WriteHeader(200)
			w.Write(binary)
			w.(http.Flusher).Flush()
			chunk := bytes.Repeat([]byte("#"), 64<<10)
			for sent := 0; sent < 8<<20; sent += len(chunk) {
				if _, err := w.Write(chunk); err != nil {
					break
				}
				w.(http.Flusher).Flush()
				time.Sleep(2 * time.Millisecond)
				if n := sizeIntentPartialSize(root); n > maxFile.Load() {
					maxFile.Store(n)
				}
				if r.Context().Err() != nil {
					break
				}
			}
		default:
			w.Header().Set("Content-Length", fmt.Sprint(len(binary)))
			w.Write(binary)
		}
	}))
	defer srv.Close()
	t.Setenv(SeamEnv, srv.URL)
	source := srv.URL + "/" + Version + "/linux-x64/claude"
	var stderr bytes.Buffer
	a := New(Options{Home: home, Stderr: &stderr}).(*adapter)
	a.goos, a.goarch = "linux", "amd64"
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	err := a.ensureRuntime(ctx)
	srv.Close()
	reason, detail := "", ""
	if err != nil {
		if e, ok := sys.AsError(err); ok {
			reason, detail = e.Class+"/"+e.Reason, e.Detail
		} else {
			reason, detail = "not a *sys.Error", err.Error()
		}
	}
	data, readErr := os.ReadFile(RuntimePath(home))
	_, dirErr := os.Lstat(RuntimeDir(home))
	partial, _ := filepath.Glob(filepath.Join(root, ".partial-*"))
	result := map[string]any{
		"requests":         requests.Load(),
		"success":          err == nil,
		"reason":           reason,
		"detail":           strings.ReplaceAll(detail, source, "{source}"),
		"installed":        readErr == nil && bytes.Equal(data, binary),
		"runtimeDir":       dirErr == nil,
		"partialCount":     len(partial),
		"closedBeforeBody": closedBeforeBody.Load(),
		"fileWithinBound":  maxFile.Load() <= int64(len(binary))+1,
		"stderr":           strings.ReplaceAll(stderr.String(), home, "{home}"),
	}
	raw, e := json.Marshal(result)
	if e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(os.Getenv("INTENT_SIZE_RESULT"), raw, 0o600); e != nil {
		t.Fatal(e)
	}
}
`;
function run(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-size-'));
  try {
    const target = path.resolve('executor/claudecode/intent_size_mismatch_capture_test.go');
    const fixture = path.join(root, 'capture_test.go');
    const result = path.join(root, 'result.json');
    fs.writeFileSync(fixture, source);
    const overlay = path.join(root, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[target]: fixture}}));
    const args = ['test', '-overlay', overlay, './executor/claudecode', '-run', '^TestIntentSizeMismatchCapture$', '-count=1', '-timeout=60s'];
    const proc = cp.spawnSync('go', args, {encoding: 'utf8', env: {...process.env, INTENT_SIZE_MODE: mode, INTENT_SIZE_RESULT: result}, timeout: 110000});
    assert.equal(proc.status, 0, `TestIntentSizeMismatchCapture (${mode}): go ${args.join(' ')} exited ${proc.status}: ${proc.error || ''}\n${proc.stdout}${proc.stderr}`);
    assert.ok(fs.existsSync(result), `TestIntentSizeMismatchCapture (${mode}) absent, skipped or ran zero times: go ${args.join(' ')} wrote no result\n${proc.stdout}`);
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
// Known-bad results observed from this capture: the unchanged tree's single refusal message, and
// a scratch installer that read the body without the one-byte-past limit.
const old = 'the downloaded Claude Code 2.1.318 does not match its pinned SHA-256; nothing was installed';
const refused = {requests: 1, success: false, reason: 'executor/unavailable', detail: old, installed: false, runtimeDir: false, partialCount: 0, closedBeforeBody: false, fileWithinBound: true};
const known = {
  page: [refused],
  announced: [refused],
  'announced-longer': [refused],
  'chunked-short': [refused],
  longer: [refused, {...refused, fileWithinBound: false}],
};
if (require.main === module) {
  const table = rows();
  if (table.length !== 7) {
    console.log(`expected 7 example rows in ${feature}, found ${table.length}`);
    process.exit(2);
  }
  if (process.argv[2] === 'good') {
    for (const [, want] of table) verify({...want, stderr: 'kogen: installing\n'}, want);
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
        const bad = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : value + 'x';
        reject(mode, {...want, [key]: bad}, want, key);
        const missing = {...want};
        delete missing[key];
        reject(mode, missing, want, `missing ${key}`);
      }
    }
    console.log(`observer rejected ${count} known-bad results`);
    process.exitCode = 1;
  }
}
