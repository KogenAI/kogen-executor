'use strict';
const { When, Then, setDefaultTimeout } = require('@cucumber/cucumber');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
setDefaultTimeout(180000);
When('I SIGKILL the real external adapter owner during a {string} command', function (role) {
  assert.ok(['build', 'shape', 'review'].includes(role));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-exec-driver-'));
  try {
    const bin = path.join(dir, 'driver');
    const built = spawnSync('go', ['build', '-o', bin, './features/steps/k_exec_kill_driver.go'], { encoding: 'utf8', timeout: 120000 });
    assert.equal(built.status, 0, `go build acceptance driver: ${built.error || ''}\n${built.stdout}${built.stderr}`);
    this.custody = spawnSync(bin, ['adapter', role], { encoding: 'utf8', timeout: 60000 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
Then('external custody exits with status {int} and reports {string}', function (status, report) {
  const r = this.custody;
  assert.ok(r, 'the real adapter driver must have run');
  assert.equal(r.status, status, `adapter lifecycle result: ${r.error || ''}\n${r.stdout}${r.stderr}`);
  assert.equal(r.stdout, report + '\n');
  assert.equal(r.stderr, '');
});
