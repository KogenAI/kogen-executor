'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');

const P = 'k-exec-child-env-behavior-shaping-vars-stripped: ';
const NAMES = ['MAX_THINKING_TOKENS', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'MAX_MCP_OUTPUT_TOKENS',
  'BASH_DEFAULT_TIMEOUT_MS', 'BASH_MAX_TIMEOUT_MS', 'BASH_MAX_OUTPUT_LENGTH', 'CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR',
  'DISABLE_PROMPT_CACHING', 'DISABLE_PROMPT_CACHING_HAIKU', 'DISABLE_PROMPT_CACHING_SONNET',
  'DISABLE_PROMPT_CACHING_OPUS', 'DISABLE_PROMPT_CACHING_FABLE'];
const KEPT = ['HTTPS_PROXY=http://proxy.invalid:3128', 'NO_PROXY=localhost', 'SSL_CERT_FILE=/etc/ssl/cert.pem', 'LANG=C.UTF-8', 'PATH=/bin'];
const key = kv => kv.split('=')[0];
const withKey = (env, k) => env.filter(kv => key(kv) === k);

const TEST = `package claudecode

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestKEnvBehaviourCapture(t *testing.T) {
	var in struct {
		Mode   string   \`json:"mode"\`
		Base   []string \`json:"base"\`
		Parent []string \`json:"parent"\`
	}
	if err := json.Unmarshal([]byte(os.Getenv("KENV_INPUT")), &in); err != nil {
		t.Fatal(err)
	}
	out := map[string]any{}
	switch in.Mode {
	case "direct":
		out["env"] = childEnv(in.Base, "/h", "", "/cfg")
	case "round":
		h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
		h.task.Role, h.task.Schema = executor.RoleBuild, json.RawMessage(buildSchema)
		s, err := h.start(h.f.options(in.Parent...))
		if err != nil {
			t.Fatal(err)
		}
		_, err = s.Round(context.Background(), executor.Input{})
		s.Close()
		if err != nil {
			t.Fatal(err)
		}
		out["env"] = h.f.env(1)
	default:
		t.Fatalf("unknown mode %q", in.Mode)
	}
	b, _ := json.Marshal(out)
	os.Stdout.WriteString("KENV_OUT=" + string(b) + "\\n")
}
`;

function capture(input) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kenv-'));
  try {
    fs.cpSync(process.cwd(), tmp, { recursive: true, filter: s => !s.split(path.sep).includes('.git') });
    fs.writeFileSync(path.join(tmp, 'executor/claudecode/kenv_capture_test.go'), TEST);
    const r = spawnSync('go', ['test', '-count=1', '-run', '^TestKEnvBehaviourCapture$', '-v', './executor/claudecode/'],
      { cwd: tmp, encoding: 'utf8', env: { ...process.env, KENV_INPUT: JSON.stringify(input) } });
    const m = /KENV_OUT=(.*)/.exec(r.stdout || '');
    assert.ok(m, `${P}capture test produced no output: ${r.stdout}${r.stderr}`);
    return JSON.parse(m[1]).env;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

When(P + 'childEnv runs over a base holding every behaviour variable plus HTTPS_PROXY, NO_PROXY, SSL_CERT_FILE, LANG and PATH', function () {
  const base = [...KEPT, 'CLAUDE_CONFIG_DIR=old', 'HOME=old', ...NAMES.map(n => n + '=inherited')];
  this.env = capture({ mode: 'direct', base });
});

Then(P + 'the child environment has none of the behaviour variables, keeps the five passthrough entries and has one CLAUDE_CONFIG_DIR, one HOME and the setEnv entries', function () {
  for (const n of NAMES) assert.deepEqual(withKey(this.env, n), [], `${n} reached the child environment`);
  for (const e of KEPT) assert.deepEqual(withKey(this.env, key(e)), [e], `entries for ${key(e)}`);
  assert.deepEqual(withKey(this.env, 'CLAUDE_CONFIG_DIR'), ['CLAUDE_CONFIG_DIR=/cfg']);
  assert.deepEqual(withKey(this.env, 'HOME'), ['HOME=/h']);
  for (const e of ['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY=1', 'DISABLE_UPDATES=1']) {
    assert.deepEqual(withKey(this.env, key(e)), [e], `entries for ${key(e)}`);
  }
});

When(P + 'a round runs while the parent holds MAX_THINKING_TOKENS=1 and BASH_DEFAULT_TIMEOUT_MS=1', function () {
  this.env = capture({ mode: 'round', parent: ['MAX_THINKING_TOKENS=1', 'BASH_DEFAULT_TIMEOUT_MS=1'] });
});

Then(P + 'the fake claude saw neither variable', function () {
  assert.deepEqual(withKey(this.env, 'MAX_THINKING_TOKENS'), []);
  assert.deepEqual(withKey(this.env, 'BASH_DEFAULT_TIMEOUT_MS'), []);
});

Then(P + '{string} names every behaviour variable in backticks', function (file) {
  const text = fs.readFileSync(file, 'utf8');
  const missing = NAMES.filter(n => !text.includes('`' + n + '`'));
  assert.deepEqual(missing, [], `${file} does not name these variables in backticks`);
});
