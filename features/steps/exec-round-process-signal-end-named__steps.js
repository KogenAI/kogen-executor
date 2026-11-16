'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {When, Then} = require('@cucumber/cucumber');
const P = 'exec-round-process-signal-end-named: ';

// Copies the driver test into the executor package through a go overlay (the file does not
// exist in the tree) and runs the one scenario it names.
function runDriver(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'round-signal-end-'));
  try {
    const source = path.resolve('features/steps/exec-round-process-signal-end-named__driver/driver_test.go.txt');
    const overlay = path.join(dir, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[path.resolve('executor/claudecode/zz_round_signal_end_acceptance_test.go')]: source}}));
    const r = spawnSync('go', ['test', '-overlay', overlay, '-count=1', '-run', '^TestRSEAcceptance$', '-v', './executor/claudecode'], {encoding: 'utf8', timeout: 110000, env: {...process.env, RSE_SCENARIO: scenario}});
    return {scenario, status: r.status, output: (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '')};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

function expectOk(world, scenario) {
  const r = world.rse;
  assert.ok(r, 'the driver has not run');
  assert.equal(r.scenario, scenario);
  assert.equal(r.status, 0, `driver scenario ${scenario} exited ${r.status}:\n${r.output}`);
  assert.ok(r.output.includes('RSE_OK ' + scenario), `driver scenario ${scenario} did not complete:\n${r.output}`);
}

When(P + 'a round ends with the fake Claude Code ended by signal at the {string} point', {timeout: 120000}, function (point) { this.rse = runDriver(point); });
Then(P + 'the failure says Claude Code was ended by signal 15 \\(terminated\\) before starting and keeps the stderr tail', function () { expectOk(this, 'before-init'); });
Then(P + 'the failure says Claude Code was ended by signal 9 \\(killed\\) without a result', function () { expectOk(this, 'without-result'); });
Then(P + 'the failure says Claude Code was ended by signal 9 \\(killed\\) after a success result', function () { expectOk(this, 'after-success'); });
