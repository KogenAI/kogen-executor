'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
function run(mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bounded-guard-'));
  try {
    const source = path.resolve('features/steps/bounded_guard_test.go.txt');
    const overlay = path.join(dir, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace:{[path.resolve('executor/claudecode/zz_bounded_acceptance_test.go')]:source}}));
    const binary = path.join(dir, 'guard.test');
    let r = spawnSync('go', ['test', '-overlay', overlay, '-c', '-o', binary, './executor/claudecode'], {encoding:'utf8', timeout:180000});
    assert.equal(r.status, 0, `compile bounded guard driver: ${r.error || ''}\n${r.stdout}${r.stderr}`);
    r = spawnSync(binary, ['-test.run=^TestBoundedGuardAcceptance$', '-test.v', '-test.timeout=30s'], {encoding:'utf8', timeout:40000, env:{...process.env, BOUNDED_GUARD_MODE:mode}});
    const output = (r.stdout || '') + (r.stderr || '');
    assert.ok(output.includes('=== RUN   TestBoundedGuardAcceptance'), `TestBoundedGuardAcceptance absent; ${r.status}: ${output}`);
    if (mode === 'bad') {
      assert.notEqual(r.status, 0, `TestBoundedGuardAcceptance bad control passed: ${output}`);
      assert.ok(output.includes('guard observation mismatch'), `TestBoundedGuardAcceptance bad control missed observer: ${output}`);
    } else {
      assert.equal(r.status, 0, `TestBoundedGuardAcceptance (${mode}) outcome ${r.status}: ${r.error || ''}\n${output}`);
      assert.ok(output.includes('BOUNDED_GUARD_OK'), `TestBoundedGuardAcceptance incomplete: ${output}`);
    }
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
if (require.main === module) {
  const mode = process.argv[2];
  run(mode);
  console.log(mode === 'bad' ? 'guard observer rejected' : 'guard observer accepted');
  if (mode === 'bad') process.exitCode = 1;
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I exercise bounded guarded calls with {string}', {timeout:240000}, function(mode) { run(mode); this.boundedGuardComplete = true; });
  Then('the guarded-call observations satisfy the bounded-work contract', function() { assert.equal(this.boundedGuardComplete, true); });
}
