const { When, Then, setDefaultTimeout } = require('@cucumber/cucumber');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
setDefaultTimeout(290000);
function run(args) {
  const result = spawnSync('go', args, { encoding: 'utf8', timeout: 240000, env: { ...process.env, GOFLAGS: '-trimpath' }, maxBuffer: 32 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `go ${args.join(' ')} killed by ${result.signal}; report host, do not retry`);
  const events = result.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { result, events, command: `go ${args.join(' ')}` };
}
function passed(run, name) {
  const matches = run.events.filter(e => e.Test === name && e.Action === 'pass');
  assert.equal(matches.length, 1, `${run.command}: required test ${name} absent, skipped or ran zero/multiple times; status=${run.result.status}\n${run.result.stdout}\n${run.result.stderr}`);
}
When('e-installed-test-stub-size-check: I run the existing size rule regression', function () {
  this.sizeRun = run(['test', '-json', '-count=1', './executor/claudecode', '-run', '^TestRuntimeSizeRule$']);
});
Then('e-installed-test-stub-size-check: these size rule cases pass', function (table) {
  passed(this.sizeRun, 'TestRuntimeSizeRule');
  for (const row of table.hashes()) passed(this.sizeRun, `TestRuntimeSizeRule/${row.case}`);
  assert.equal(this.sizeRun.result.status, 0, `${this.sizeRun.command}: TestRuntimeSizeRule failed\n${this.sizeRun.result.stdout}\n${this.sizeRun.result.stderr}`);
});
When('e-installed-test-stub-size-check: I run the executor Go suite', function () {
  this.suiteRun = run(['test', '-json', '-count=1', './...']);
});
Then('e-installed-test-stub-size-check: the suite passes including {string}', function (name) {
  passed(this.suiteRun, name);
  assert.equal(this.suiteRun.result.status, 0, `${this.suiteRun.command}: required ${name} and full suite must pass\n${this.suiteRun.result.stdout}\n${this.suiteRun.result.stderr}`);
});
