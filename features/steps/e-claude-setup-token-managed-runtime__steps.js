'use strict';
// Acceptance steps of e-claude-setup-token-managed-runtime. Each run overlays a capture test on
// package claudecode: it serves a fake pinned runtime from a local origin through SeamEnv (or
// places it where RuntimePath(home) points), calls SetupToken with a recording out writer and a
// file as standard input, and reports what came back. The fake records what it observed in a
// side directory. Run directly, `good` and `bad` qualify the checks on known observations.
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const P = 'e-claude-setup-token-managed-runtime: ';
const TEST = 'TestESetupTokenCapture';
const TOKEN = 'sk-ant-oat01-FAKE-SETUP-TOKEN-0123456789';
const TOKEN_PARTS = ['sk-ant-oat01', 'FAKE-SETUP', 'TOKEN-0123456789'];
const RETRY = '; run `kogen provider login claude-code` to retry';
const CONFIG = '{home}/.kogen/claude-code/config';

// FAKE answers --version like the pinned runtime and otherwise plays a setup-token sign-in:
// the sign-in URL, a paste prompt without a line end that waits up to 5 s for out to show it,
// a line read from standard input, then the token screen of E_SETUP_MODE.
const FAKE = String.raw`#!/bin/sh
if [ "$1" = "--version" ]; then echo '2.1.312 (Claude Code)'; exit 0; fi
side="$E_SETUP_SIDE"
printf '%s\n' "$@" >> "$side/args"
printf '%s' "$CLAUDE_CONFIG_DIR" > "$side/config"
ps -o pgid= -p $$ > "$side/pgid"
ps -o pgid= -p $PPID > "$side/parent-pgid"
echo 'fake runtime notice on stderr' >&2
printf 'Browser did not open? Use the url below to sign in\n\n'
printf 'https://claude.example/oauth/authorize?fake=1\n\n'
printf 'Paste code here if prompted > '
i=0
while [ ! -f "$side/go" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i+1)); done
if [ -f "$side/go" ]; then echo yes > "$side/gate"; else echo no > "$side/gate"; fi
IFS= read -r code || true
printf '%s' "$code" > "$side/stdin"
printf '\n'
case "$E_SETUP_MODE" in
none) exit 0 ;;
garbled) printf 'Your OAuth token (valid for 1 year):\n\n not a token\n\nStore this token securely.\n'; exit 0 ;;
wrapped) printf ' Your OAuth token (valid for 1 year):\n\n \033[1msk-ant-oat01-FAKE-SETUP-\033[22m\n \033[1mTOKEN-0123456789\033[22m\n\n Store this token securely.\n'; exit 0 ;;
esac
printf 'Your OAuth '
sleep 0.2
printf 'token (valid for 1 year):\n\nsk-ant-oat01-FAKE-SETUP-TOKEN-0123456789\n\nStore this token securely.\n'
if [ "$E_SETUP_MODE" = fail ]; then echo 'fake setup-token failure' >&2; exit 3; fi
exit 0
`;

const CAPTURE = String.raw`package claudecode

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
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

// eSetupTokenOut records out and opens the fake runtime's gate once the paste prompt is in it.
type eSetupTokenOut struct {
	mu   sync.Mutex
	buf  bytes.Buffer
	gate string
}

func (w *eSetupTokenOut) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.buf.Write(p)
	if strings.Contains(w.buf.String(), "Paste code here if prompted >") {
		if _, err := os.Stat(w.gate); err != nil {
			os.WriteFile(w.gate, []byte("open\n"), 0o600)
		}
	}
	return len(p), nil
}

func TestESetupTokenCapture(t *testing.T) {
	mode := os.Getenv("E_SETUP_MODE")
	side := os.Getenv("E_SETUP_SIDE")
	fake, err := os.ReadFile(os.Getenv("E_SETUP_FAKE"))
	if err != nil {
		t.Fatal(err)
	}
	platform, ok := Supported()
	if !ok {
		t.Fatal("Kogen's Claude Code runtime does not support this platform")
	}
	home := t.TempDir()
	sum := sha256.Sum256(fake)
	var downloads atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/" + Version + "/manifest.json":
			manifest, _ := json.Marshal(map[string]any{"version": Version, "platforms": map[string]any{platform: map[string]any{"binary": "claude", "checksum": hex.EncodeToString(sum[:]), "size": len(fake)}}})
			w.Write(manifest)
		case "/" + Version + "/" + platform + "/claude":
			downloads.Add(1)
			if mode == "install-fails" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Length", fmt.Sprint(len(fake)))
			w.Write(fake)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	t.Setenv(SeamEnv, srv.URL)
	if mode != "missing" && mode != "install-fails" {
		if err := os.MkdirAll(RuntimeDir(home), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(RuntimePath(home), fake, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	terminal := filepath.Join(side, "terminal")
	if err := os.WriteFile(terminal, []byte("PASTED-CODE-123\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	stdin, err := os.Open(terminal)
	if err != nil {
		t.Fatal(err)
	}
	saved := os.Stdin
	os.Stdin = stdin
	defer func() {
		os.Stdin = saved
		stdin.Close()
	}()
	out := &eSetupTokenOut{gate: filepath.Join(side, "go")}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	token, err := SetupToken(ctx, home, out)
	result := map[string]any{"token": token, "error": "", "reason": "", "downloads": downloads.Load(), "home": home}
	if err != nil {
		result["error"] = err.Error()
		result["reason"] = "not an executor error"
		if e, ok := sys.AsError(err); ok {
			result["reason"] = e.Class + "/" + e.Reason
		}
	}
	out.mu.Lock()
	result["out"] = out.buf.String()
	out.mu.Unlock()
	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("E_SETUP_RESULT"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;

// STUB stands in while package claudecode exports no SetupToken, so the capture still runs.
const STUB = String.raw`package claudecode

import (
	"context"
	"errors"
	"io"
)

func SetupToken(ctx context.Context, home string, out io.Writer) (string, error) {
	return "", errors.New("SetupToken is not exported by package claudecode")
}
`;

function run(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e-setup-token-'));
  try {
    const side = path.join(root, 'side');
    fs.mkdirSync(side);
    const fake = path.join(root, 'fake-claude');
    fs.writeFileSync(fake, FAKE);
    const capture = path.join(root, 'capture_test.go');
    fs.writeFileSync(capture, CAPTURE);
    const replace = {[path.resolve('executor/claudecode/e_claude_setup_token_capture_test.go')]: capture};
    const doc = cp.spawnSync('go', ['doc', './executor/claudecode', 'SetupToken'], {encoding: 'utf8', timeout: 60000});
    const exported = doc.status === 0;
    if (!exported) {
      const stub = path.join(root, 'stub_test.go');
      fs.writeFileSync(stub, STUB);
      replace[path.resolve('executor/claudecode/e_claude_setup_token_stub_test.go')] = stub;
    }
    const overlay = path.join(root, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: replace}));
    const result = path.join(root, 'result.json');
    const args = ['test', '-overlay', overlay, './executor/claudecode', '-run', `^${TEST}$`, '-count=1', '-v', '-timeout=120s'];
    const proc = cp.spawnSync('go', args, {encoding: 'utf8', timeout: 170000,
      env: {...process.env, E_SETUP_MODE: mode, E_SETUP_SIDE: side, E_SETUP_FAKE: fake, E_SETUP_RESULT: result}});
    const o = {mode, command: `go ${args.join(' ')}`, status: proc.status, output: `${proc.error || ''}${proc.stdout}${proc.stderr}`, exported, result: fs.existsSync(result)};
    if (o.result) {
      const r = JSON.parse(fs.readFileSync(result, 'utf8'));
      const norm = s => s.split(r.home).join('{home}');
      const read = name => {
        const p = path.join(side, name);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      };
      const config = read('config');
      Object.assign(o, {
        token: r.token, error: norm(r.error), reason: r.reason, downloads: r.downloads, out: norm(r.out),
        args: read('args'), config: config === null ? null : norm(config), stdin: read('stdin'),
        pgid: (read('pgid') || '').trim(), parentPgid: (read('parent-pgid') || '').trim(), gate: (read('gate') || '').trim(),
      });
    }
    return o;
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

// digests reads the SHA-256 of each listed file now; a missing file has none.
function digests(rows) {
  return rows.map(row => ({path: row.path, sha256: fs.existsSync(row.path) ? crypto.createHash('sha256').update(fs.readFileSync(row.path)).digest('hex') : null}));
}

const EXISTING = ['./executor/claudecode', './contract'];

// runExisting runs the package's and the contract suite's tests as the configured go-test check does.
function runExisting() {
  const args = ['test', '-count=1', ...EXISTING];
  const proc = cp.spawnSync('go', args, {encoding: 'utf8', timeout: 290000, env: {...process.env, GOFLAGS: '-trimpath'}});
  return {command: `GOFLAGS=-trimpath go ${args.join(' ')}`, status: proc.status, output: `${proc.error || ''}${proc.stdout}${proc.stderr}`};
}

const summary = o => JSON.stringify({exported: o.exported, token: o.token, error: o.error, reason: o.reason, downloads: o.downloads, args: o.args, out: o.out});

const checks = {
  unchanged(observed, rows) {
    assert.equal(observed.length, rows.length, 'the digest list and the observation differ in length');
    rows.forEach((row, i) => {
      assert.equal(observed[i].path, row.path, `digest row ${i} names ${observed[i].path}, not ${row.path}`);
      assert.equal(observed[i].sha256, row.sha256, `${row.path} is ${observed[i].sha256 === null ? 'missing' : 'changed (sha256 ' + observed[i].sha256 + ')'}, expected sha256 ${row.sha256}`);
    });
  },
  existingPass(r) {
    assert.equal(r.status, 0, `${r.command} exited ${r.status}\n${r.output}`);
    for (const pkg of ['github.com/KogenAI/kogen-executor/executor/claudecode', 'github.com/KogenAI/kogen-executor/contract']) {
      assert.match(r.output, new RegExp(`^ok\\s+${pkg}\\s`, 'm'), `${r.command} reported no passing run of ${pkg}\n${r.output}`);
    }
  },
  ran(o) {
    assert.equal(o.status, 0, `${TEST} (${o.mode}): ${o.command} exited ${o.status}\n${o.output}`);
    assert.ok(o.result && o.output.includes(`--- PASS: ${TEST}`), `${TEST} (${o.mode}) absent, skipped or ran zero times: ${o.command} exited ${o.status} and wrote ${o.result ? 'a result' : 'no result'}\n${o.output}`);
  },
  downloads(o, n) {
    assert.equal(o.downloads, n, `${o.mode}: the pinned runtime was downloaded ${o.downloads} times, not ${n}: ${summary(o)}`);
  },
  outHas(o, s) {
    assert.ok(o.out.includes(s), `${o.mode}: out lacks ${JSON.stringify(s)}: ${summary(o)}`);
  },
  outLacks(o, s) {
    assert.ok(!o.out.includes(s), `${o.mode}: out contains ${JSON.stringify(s)}: ${summary(o)}`);
  },
  ranWith(o, arg) {
    assert.equal(o.args, `${arg}\n`, `${o.mode}: the fake runtime's recorded arguments of all its runs are ${JSON.stringify(o.args)}, not one run with ${JSON.stringify(arg)}: ${summary(o)}`);
  },
  configDir(o) {
    assert.equal(o.config, CONFIG, `${o.mode}: the fake runtime ran with CLAUDE_CONFIG_DIR ${JSON.stringify(o.config)}: ${summary(o)}`);
  },
  readStdin(o, s) {
    assert.equal(o.stdin, s, `${o.mode}: the fake runtime read ${JSON.stringify(o.stdin)} from its standard input: ${summary(o)}`);
  },
  sameGroup(o) {
    assert.ok(o.pgid !== '' && o.pgid === o.parentPgid, `${o.mode}: the fake runtime ran in process group ${JSON.stringify(o.pgid)}, its caller in ${JSON.stringify(o.parentPgid)}: ${summary(o)}`);
  },
  promptReached(o) {
    assert.equal(o.gate, 'yes', `${o.mode}: the paste prompt did not reach out within 5 s while the fake runtime waited (gate ${JSON.stringify(o.gate)}): ${summary(o)}`);
  },
  didNotRun(o) {
    assert.equal(o.args, null, `${o.mode}: the fake runtime ran with ${JSON.stringify(o.args)}: ${summary(o)}`);
  },
  returnsToken(o, token) {
    assert.equal(o.error, '', `${o.mode}: SetupToken returned an error: ${summary(o)}`);
    assert.equal(o.token, token, `${o.mode}: SetupToken returned ${JSON.stringify(o.token)}: ${summary(o)}`);
  },
  returnsNoToken(o) {
    assert.equal(o.token, '', `${o.mode}: SetupToken returned a token: ${summary(o)}`);
  },
  errorSays(o, s) {
    assert.equal(o.reason, 'executor/unavailable', `${o.mode}: the error is not executor/unavailable: ${summary(o)}`);
    assert.ok(o.error.includes(s), `${o.mode}: the error does not say ${JSON.stringify(s)}: ${summary(o)}`);
  },
  errorLacks(o, s) {
    assert.ok(!o.error.includes(s), `${o.mode}: the error says ${JSON.stringify(s)}: ${summary(o)}`);
  },
  errorRetry(o) {
    assert.ok(o.error.includes(RETRY), `${o.mode}: the error does not say ${JSON.stringify(RETRY)}: ${summary(o)}`);
  },
  tokenFree(o) {
    for (const part of TOKEN_PARTS) {
      assert.ok(!o.out.includes(part), `${o.mode}: out contains the token part ${part}: ${summary(o)}`);
      assert.ok(!o.error.includes(part), `${o.mode}: the error contains the token part ${part}: ${summary(o)}`);
    }
  },
};

// controls runs the checks on a known-good observation of each kind and on known-bad mutations.
function controls(bad) {
  const installing = 'kogen: installing Claude Code 2.1.312 into {home}/.kogen/claude-code/2.1.312';
  const good = {
    mode: 'missing', command: 'go test', status: 0, output: `=== RUN   ${TEST}\n--- PASS: ${TEST} (0.50s)\nPASS\n`, exported: true, result: true,
    token: TOKEN, error: '', reason: '', downloads: 1,
    out: `${installing}\nkogen: installed Claude Code 2.1.312 (sha256 0)\nfake runtime notice on stderr\nBrowser did not open? Use the url below to sign in\n\nhttps://claude.example/oauth/authorize?fake=1\n\nPaste code here if prompted > \n`,
    args: 'setup-token\n', config: CONFIG, stdin: 'PASTED-CODE-123', pgid: '501', parentPgid: '501', gate: 'yes',
  };
  const runFailure = "Kogen's Claude Code `setup-token` failed: exit status 3";
  const failed = {...good, mode: 'fail', token: '', error: `executor/unavailable: ${runFailure}${RETRY}`, reason: 'executor/unavailable'};
  const notRun = {...failed, mode: 'install-fails', args: null};
  const known = [
    ['ran', good, []], ['downloads', good, [1]], ['outHas', good, [installing]], ['ranWith', good, ['setup-token']],
    ['configDir', good, []], ['readStdin', good, ['PASTED-CODE-123']], ['sameGroup', good, []],
    ['outHas', good, ['https://claude.example/oauth/authorize?fake=1']], ['promptReached', good, []],
    ['returnsToken', good, [TOKEN]], ['outLacks', good, ['Store this token securely']], ['tokenFree', good, []],
    ['returnsNoToken', failed, []], ['errorSays', failed, [runFailure]], ['errorRetry', failed, []],
    ['errorLacks', failed, ['printed no token']], ['tokenFree', failed, []], ['didNotRun', notRun, []],
  ];
  const rows = [{path: 'go.mod', sha256: 'a'.repeat(64)}, {path: 'go.sum', sha256: 'b'.repeat(64)}];
  const same = rows.map(row => ({...row}));
  const passed = {command: 'GOFLAGS=-trimpath go test -count=1 ./executor/claudecode ./contract', status: 0,
    output: 'ok  \tgithub.com/KogenAI/kogen-executor/executor/claudecode\t30.351s\nok  \tgithub.com/KogenAI/kogen-executor/contract\t0.317s\n'};
  known.push(['unchanged', same, [rows]], ['existingPass', passed, []]);
  for (const [name, o, args] of known) checks[name](o, ...args);
  if (!bad) {
    console.log('observer good');
    return;
  }
  const mutations = [
    ['ran', good, [], o => { o.status = 1; }],
    ['ran', good, [], o => { o.output = 'testing: warning: no tests to run\nPASS\n'; }],
    ['ran', good, [], o => { o.result = false; }],
    ['downloads', good, [1], o => { o.downloads = 0; }],
    ['downloads', good, [1], o => { o.downloads = 2; }],
    ['outHas', good, [installing], o => { o.out = ''; }],
    ['ranWith', good, ['setup-token'], o => { o.args = 'setup-token\nsetup-token\n'; }],
    ['ranWith', good, ['setup-token'], o => { o.args = null; }],
    ['ranWith', good, ['setup-token'], o => { o.args = 'setup-token\n--json\n'; }],
    ['configDir', good, [], o => { o.config = '{home}/.claude'; }],
    ['configDir', good, [], o => { o.config = null; }],
    ['readStdin', good, ['PASTED-CODE-123'], o => { o.stdin = ''; }],
    ['sameGroup', good, [], o => { o.pgid = '777'; }],
    ['sameGroup', good, [], o => { o.pgid = ''; o.parentPgid = ''; }],
    ['promptReached', good, [], o => { o.gate = 'no'; }],
    ['promptReached', good, [], o => { o.gate = ''; }],
    ['returnsToken', good, [TOKEN], o => { o.token = 'sk-ant-oat01-FAKE-SETUP-'; }],
    ['returnsToken', good, [TOKEN], o => { o.token = `${TOKEN}\n`; }],
    ['returnsToken', good, [TOKEN], o => { o.error = 'executor/unavailable: x'; }],
    ['outLacks', good, ['Store this token securely'], o => { o.out += 'Store this token securely.\n'; }],
    ['tokenFree', good, [], o => { o.out += TOKEN; }],
    ['tokenFree', good, [], o => { o.out += 'TOKEN-0123456789\n'; }],
    ['tokenFree', failed, [], o => { o.error += ' sk-ant-oat01-FAKE-SETUP-'; }],
    ['returnsNoToken', failed, [], o => { o.token = TOKEN; }],
    ['errorSays', failed, [runFailure], o => { o.reason = 'executor/failed'; }],
    ['errorSays', failed, [runFailure], o => { o.error = `executor/unavailable: Kogen's Claude Code \`setup-token\` printed no token${RETRY}`; }],
    ['errorRetry', failed, [], o => { o.error = o.error.replace(RETRY, ''); }],
    ['errorLacks', failed, ['printed no token'], o => { o.error += ' printed no token'; }],
    ['didNotRun', notRun, [], o => { o.args = 'setup-token\n'; }],
    ['unchanged', same, [rows], o => { o[1].sha256 = 'c'.repeat(64); }],
    ['unchanged', same, [rows], o => { o[0].sha256 = null; }],
    ['unchanged', same, [rows], o => { o.pop(); }],
    ['existingPass', passed, [], o => { o.status = 1; }],
    ['existingPass', passed, [], o => { o.output = 'ok  \tgithub.com/KogenAI/kogen-executor/executor/claudecode\t30.351s\nFAIL\tgithub.com/KogenAI/kogen-executor/contract\t0.317s\n'; }],
    ['existingPass', passed, [], o => { o.output = '?   \tgithub.com/KogenAI/kogen-executor/contract\t[no test files]\n'; }],
  ];
  for (const [name, base, args, mutate] of mutations) {
    const o = structuredClone(base);
    mutate(o);
    let accepted = true;
    try {
      checks[name](o, ...args);
    } catch (e) {
      if (!(e instanceof assert.AssertionError)) throw e;
      accepted = false;
    }
    if (accepted) {
      console.log(`observer missed a bad ${name}`);
      return;
    }
  }
  console.log('observer bad rejected');
  process.exitCode = 1;
}

if (require.main === module) {
  controls(process.argv[2] === 'bad');
} else {
  const {Then} = require('@cucumber/cucumber');
  Then(P + 'SetupToken runs with the {string} fake runtime', {timeout: 180000}, function (mode) {
    this.eSetupToken = run(mode);
    checks.ran(this.eSetupToken);
  });
  Then(P + 'go.mod, go.sum and the existing test files keep these SHA-256 digests:', function (table) {
    const rows = table.hashes();
    checks.unchanged(digests(rows), rows);
  });
  Then(P + 'the existing tests of package claudecode and the contract suite pass', {timeout: 300000}, function () {
    checks.existingPass(runExisting());
  });
  Then(P + 'the pinned runtime was downloaded {int} time(s)', function (n) { checks.downloads(this.eSetupToken, n); });
  Then(P + 'out contains {string}', function (s) { checks.outHas(this.eSetupToken, s); });
  Then(P + 'out does not contain {string}', function (s) { checks.outLacks(this.eSetupToken, s); });
  Then(P + 'the fake runtime ran once with the argument {string}', function (arg) { checks.ranWith(this.eSetupToken, arg); });
  Then(P + "the fake runtime ran with Kogen's configuration directory", function () { checks.configDir(this.eSetupToken); });
  Then(P + 'the fake runtime read {string} from its standard input', function (s) { checks.readStdin(this.eSetupToken, s); });
  Then(P + "the fake runtime ran in the caller's process group", function () { checks.sameGroup(this.eSetupToken); });
  Then(P + 'the paste prompt reached out while the fake runtime waited', function () { checks.promptReached(this.eSetupToken); });
  Then(P + 'the fake runtime did not run', function () { checks.didNotRun(this.eSetupToken); });
  Then(P + 'the call returns the token {string}', function (token) { checks.returnsToken(this.eSetupToken, token); });
  Then(P + 'the call returns no token', function () { checks.returnsNoToken(this.eSetupToken); });
  Then(P + 'the error is unavailable and says {string}', function (s) { checks.errorSays(this.eSetupToken, s); });
  Then(P + 'the error does not say {string}', function (s) { checks.errorLacks(this.eSetupToken, s); });
  Then(P + 'the error names the retry command', function () { checks.errorRetry(this.eSetupToken); });
  Then(P + 'the token appears neither in out nor in the error', function () { checks.tokenFree(this.eSetupToken); });
}
