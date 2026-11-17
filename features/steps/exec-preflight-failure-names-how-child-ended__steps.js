'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {When, Then} = require('@cucumber/cucumber');
const P = 'exec-preflight-failure-names-how-child-ended: ';

// Copies the driver test into the executor package through a go overlay (the file does not
// exist in the tree) and runs the one scenario it names.
function runDriver(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-failure-'));
  try {
    const source = path.resolve('features/steps/exec-preflight-failure-names-how-child-ended__driver/driver_test.go.txt');
    const overlay = path.join(dir, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[path.resolve('executor/claudecode/zz_preflight_failure_acceptance_test.go')]: source}}));
    const r = spawnSync('go', ['test', '-overlay', overlay, '-count=1', '-run', '^TestPFAcceptance$', '-v', './executor/claudecode'], {encoding: 'utf8', timeout: 110000, env: {...process.env, PFA_SCENARIO: scenario}});
    return {scenario, status: r.status, output: (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '')};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

function expectOk(world, scenario) {
  const r = world.pfa;
  assert.ok(r, 'the driver has not run');
  assert.equal(r.scenario, scenario);
  assert.equal(r.status, 0, `driver scenario ${scenario} exited ${r.status}:\n${r.output}`);
  assert.ok(r.output.includes('PFA_OK ' + scenario), `driver scenario ${scenario} did not complete:\n${r.output}`);
}

When(P + 'the stand-in Claude Code check {string} runs', {timeout: 120000}, function (scenario) { this.pfa = runDriver(scenario); });
Then(P + 'the version check failure is the command, then failed, then exited with status 3 and nothing more', function () { expectOk(this, 'exit-status'); });
Then(P + 'the version check failure ends with exited with status 3, then a semicolon and the stderr text boom', function () { expectOk(this, 'exit-status-stderr'); });
Then(P + 'the version check failure says it was ended by signal 9 \\(killed\\)', function () { expectOk(this, 'signal'); });
Then(P + 'the version check failure says it could not start with the fork\\/exec error for the missing path', function () { expectOk(this, 'start-error'); });
Then(P + 'the version check failure keeps the stderr text bounded to 300 bytes after the status', function () { expectOk(this, 'stderr-bounded'); });
Then(P + 'the auth status failure says it exited with status 2 in parentheses and ends with the sign-in advice', function () { expectOk(this, 'auth-exit'); });
Then(P + 'the auth status failure says it was ended by signal 15 \\(terminated\\) in parentheses and ends with the sign-in advice', function () { expectOk(this, 'auth-signal'); });
Then(P + 'the auth status failure says it could not start in parentheses and ends with the sign-in advice', function () { expectOk(this, 'auth-start-error'); });
Then(P + 'the auth status failure does not show the stderr text', function () { expectOk(this, 'auth-stderr-hidden'); });
Then(P + 'the auth status failure is the unreadable answer detail without a process ending', function () { expectOk(this, 'auth-unreadable'); });
