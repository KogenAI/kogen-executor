'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { When, Then } = require('@cucumber/cucumber');

const prefix = 'k-exec-auth-and-context-text-in-errors-array: ';
const root = process.cwd();
const pkgDir = path.join(root, 'executor', 'claudecode');
const testFile = path.join(pkgDir, 'zz_errors_array_acceptance_test.go');

// The probe test reuses the package's own fake Claude runtime. It is written for one run
// and removed afterwards; it prints the round's failure as one EA_OUT JSON line.
const probeSource = String.raw`package claudecode

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-loop/sys"
)

func TestZZErrorsArrayAcceptance(t *testing.T) {
	var res map[string]any
	if err := json.Unmarshal([]byte(os.Getenv("KOGEN_EA_RESULT")), &res); err != nil {
		t.Fatal(err)
	}
	h := roleHarness(t, executor.RoleBuild, fakeConfig{Script: oneRound(finishRound), Result: res})
	s := h.startOK()
	_, err := s.Round(context.Background(), executor.Input{})
	out := map[string]any{"class": "", "reason": "", "detail": "", "calls": ""}
	if err != nil {
		out["detail"] = err.Error()
		if e, ok := sys.AsError(err); ok {
			out["class"], out["reason"], out["detail"] = e.Class, e.Reason, e.Detail
		}
	} else {
		out["reason"] = "none"
	}
	calls, _ := os.ReadFile(filepath.Join(h.f.cfg.State, "calls"))
	out["calls"] = strings.TrimSpace(string(calls))
	b, _ := json.Marshal(out)
	fmt.Println("EA_OUT " + string(b))
}
`;

When(prefix + 'Claude Code ends a round with this error result:', function (doc) {
  const res = JSON.parse(doc);
  fs.writeFileSync(testFile, probeSource);
  let r;
  try {
    r = cp.spawnSync('go', ['test', '-count=1', '-run', '^TestZZErrorsArrayAcceptance$', '-v', '.'], {
      cwd: pkgDir, encoding: 'utf8', timeout: 240000, env: { ...process.env, KOGEN_EA_RESULT: JSON.stringify(res) },
    });
  } finally {
    fs.rmSync(testFile, { force: true });
  }
  const m = /^EA_OUT (.*)$/m.exec(r.stdout || '');
  assert.ok(m, 'go test printed no EA_OUT line; status ' + r.status + '\n' + r.stdout + r.stderr);
  this.outcome = JSON.parse(m[1]);
});

Then(prefix + 'the round fails as {string}', function (want) {
  assert.equal(this.outcome.class + '/' + this.outcome.reason, want, 'detail: ' + this.outcome.detail);
});

Then(prefix + 'the failure detail is {string}', function (want) {
  assert.equal(this.outcome.detail, want);
});

Then(prefix + 'the failure detail contains {string}', function (want) {
  assert.ok(this.outcome.detail.includes(want), 'detail ' + JSON.stringify(this.outcome.detail) + ' lacks ' + JSON.stringify(want));
});

Then(prefix + 'Claude Code was invoked {int} time(s)', function (n) {
  assert.equal(this.outcome.calls, String(n));
});
