const { Then } = require('@cucumber/cucumber');
const { execFileSync } = require('node:child_process');

Then('k-executor-loop-module-path: command succeeds', function (command) {
  execFileSync('/bin/sh', ['-ec', command], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
    timeout: 240000,
    maxBuffer: 16 * 1024 * 1024,
  });
});
