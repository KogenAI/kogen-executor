'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {When, Then} = require('@cucumber/cucumber');
const P = 'exec-round-model-usage-states-its-scope: ';

// Copies the driver test into the executor package through a go overlay (the file does not
// exist in the tree) and runs the one scenario it names.
function runDriver(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'round-model-usage-'));
  try {
    const source = path.resolve('features/steps/exec-round-model-usage-states-its-scope__driver/driver_test.go.txt');
    const overlay = path.join(dir, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {[path.resolve('executor/claudecode/zz_round_model_usage_acceptance_test.go')]: source}}));
    const r = spawnSync('go', ['test', '-overlay', overlay, '-count=1', '-run', '^TestRMSAcceptance$', '-v', './executor/claudecode'], {encoding: 'utf8', timeout: 110000, env: {...process.env, RMS_SCENARIO: scenario}});
    return {scenario, status: r.status, output: (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '')};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

function expectOk(world, scenario) {
  const r = world.rms;
  assert.ok(r, 'the driver has not run');
  assert.equal(r.scenario, scenario);
  assert.equal(r.status, 0, `driver scenario ${scenario} exited ${r.status}:\n${r.output}`);
  assert.ok(r.output.includes('RMS_OK ' + scenario), `driver scenario ${scenario} did not complete:\n${r.output}`);
}

When(P + 'the round usage driver runs the {string} scenario', {timeout: 120000}, function (scenario) { this.rms = runDriver(scenario); });
Then(P + 'the second round event says its model_usage is session scoped and reports only the round difference', function () { expectOk(this, 'second-round'); });
Then(P + 'each model is measured against its own baseline and a new model starts at zero', function () { expectOk(this, 'per-model-baseline'); });
Then(P + 'the failed round event leaves the baseline where the last successful round put it', function () { expectOk(this, 'failed-round'); });
Then(P + 'a counter that went down is left out and its lower value becomes the baseline', function () { expectOk(this, 'counter-reset'); });
Then(P + 'an event without modelUsage has neither new key and a later round measures from zero', function () { expectOk(this, 'absent'); });
