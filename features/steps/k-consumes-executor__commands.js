const { Then, setDefaultTimeout } = require('@cucumber/cucumber');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

setDefaultTimeout(300000);
Then('k-consumes-executor: this command succeeds', function (command) {
  const result = spawnSync('/bin/sh', ['-c', command], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(result.status, 0,
    `Command: ${command}\nstatus=${result.status} signal=${result.signal} error=${result.error || ''}\n${result.stdout || ''}${result.stderr || ''}`);
});
