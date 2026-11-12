const {Given, When, Then} = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const PREFIX = 'k-exec-auth-status-unreadable-answer-named: ';
const TOKEN = 'sk-ant-oat01-SYNTHETIC-UNREADABLE-TOKEN';
const GOOD = '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}';

const PROBE = `package claudecode

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestKogenAuthStatusUnreadableProbe(t *testing.T) {
	var c struct {
		Out   string \`json:"out"\`
		Exit  int    \`json:"exit"\`
		Token string \`json:"token"\`
	}
	if err := json.Unmarshal([]byte(os.Getenv("KOGEN_AUTHCASE")), &c); err != nil {
		t.Fatal(err)
	}
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
	opts := h.f.options()
	out := t.TempDir() + "/out"
	if err := os.WriteFile(out, []byte(c.Out), 0o600); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\\nif [ \\"$1\\" = --version ]; then echo '" + Version + " (Claude Code)'; exit 0; fi\\nif [ \\"$1\\" = auth ]; then cat '" + out + "'; exit " + strconv.Itoa(c.Exit) + "; fi\\nexit 64\\n"
	writeStandIn(t, RuntimePath(opts.Home), script, 0o755)
	opts.Token = c.Token
	s, err := h.start(opts)
	res := map[string]any{"ok": err == nil}
	if err != nil {
		if e, ok := sys.AsError(err); ok {
			res["reason"], res["detail"] = e.Reason, e.Detail
		} else {
			res["reason"], res["detail"] = "unclassified", err.Error()
		}
	} else {
		s.Close()
	}
	b, _ := json.Marshal(res)
	fmt.Println("KOGEN_RESULT " + string(b))
}
`;

Given(PREFIX + 'a fake claude whose auth status prints {string} and exits {int}', function (text, code) {
  this.authCase = {out: text, exit: code, token: ''};
});
Given(PREFIX + 'a fake claude whose auth status prints nothing and exits {int}', function (code) {
  this.authCase = {out: '', exit: code, token: ''};
});
Given(PREFIX + 'a fake claude whose auth status prints the stored token followed by {string} and exits {int}', function (text, code) {
  this.authCase = {out: TOKEN + text, exit: code, token: TOKEN};
});
Given(PREFIX + 'a fake claude whose auth status prints {int} bytes of text and exits {int}', function (n, code) {
  this.authCase = {out: 'x'.repeat(n), exit: code, token: ''};
});
Given(PREFIX + 'a fake claude whose auth status prints a valid claude.ai answer with an extra field and exits {int}', function (code) {
  this.authCase = {out: GOOD.replace(/}$/, ',"futureField":{"a":[1,2]}}'), exit: code, token: ''};
});

When(PREFIX + 'Kogen starts the executor', function () {
  const file = path.join(process.cwd(), 'executor', 'claudecode', 'zz_kogen_unreadable_probe_test.go');
  fs.writeFileSync(file, PROBE);
  let r;
  try {
    r = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestKogenAuthStatusUnreadableProbe$', './executor/claudecode'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 240000,
      env: {...process.env, KOGEN_AUTHCASE: JSON.stringify(this.authCase)},
    });
  } finally {
    fs.rmSync(file, {force: true});
  }
  const text = (r.stdout || '') + (r.stderr || '');
  const m = text.match(/^KOGEN_RESULT (.*)$/m);
  assert.ok(m, 'probe produced no result; go test output:\n' + text);
  this.result = JSON.parse(m[1]);
});

Then(PREFIX + 'the start error reason is {string}', function (reason) {
  assert.equal(this.result.ok, false, 'start unexpectedly succeeded');
  assert.equal(this.result.reason, reason, 'detail: ' + this.result.detail);
});
Then(PREFIX + 'the start error detail contains {string}', function (s) {
  assert.equal(this.result.ok, false, 'start unexpectedly succeeded');
  assert.ok(this.result.detail.includes(s), 'detail ' + JSON.stringify(this.result.detail) + ' lacks ' + JSON.stringify(s));
});
Then(PREFIX + 'the start error detail does not contain the stored token', function () {
  assert.equal(this.result.ok, false, 'start unexpectedly succeeded');
  assert.ok(!this.result.detail.includes(TOKEN), 'detail leaks the token: ' + this.result.detail);
  assert.ok(!this.result.detail.includes(TOKEN.slice(0, 20)), 'detail leaks part of the token: ' + this.result.detail);
});
Then(PREFIX + 'the start error detail is at most {int} bytes', function (n) {
  assert.equal(this.result.ok, false, 'start unexpectedly succeeded');
  const len = Buffer.byteLength(this.result.detail);
  assert.ok(len <= n, 'detail is ' + len + ' bytes: ' + this.result.detail.slice(0, 120));
});
Then(PREFIX + 'the start error detail does not contain {int} consecutive x characters', function (n) {
  assert.equal(this.result.ok, false, 'start unexpectedly succeeded');
  assert.ok(!this.result.detail.includes('x'.repeat(n)), 'detail holds an unbounded excerpt');
});
Then(PREFIX + 'the start succeeds', function () {
  assert.equal(this.result.ok, true, 'start failed: ' + this.result.reason + ': ' + this.result.detail);
});
