// Steps of executor-fixture-records-args-token. Go commands that need an independent probe run
// in a scratch copy of this checkout: the probe (a Go test file that uses only the public API of
// testkit/clauderuntime) is copied into the scratch copy next to the Build's own tests.
const { After, Given, When, Then, setDefaultTimeout } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

setDefaultTimeout(280000);

const P = 'executor-fixture-records-args-token: ';
const checkout = path.resolve(__dirname, '..', '..');
const probeFile = path.join(__dirname, 'executor-fixture-records-args-token__probe', 'args_token_probe_test.go.txt');
const skipped = new Set(['.git', 'node_modules', path.join('.kogen', 'local')]);
const testkitDir = path.join('testkit', 'clauderuntime');

After(function () {
  if (this.dir) fs.rmSync(this.dir, { recursive: true, force: true });
});

function run(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 270000, maxBuffer: 64 * 1024 * 1024 });
  assert.ifError(r.error);
  assert.equal(r.signal, null, `${cmd} ${args.join(' ')} was killed by ${r.signal}`);
  return { command: `${cmd} ${args.join(' ')}`, status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function jsonEvents(r) {
  return r.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
}

function passed(r, name) {
  const n = jsonEvents(r).filter((e) => e.Test === name && e.Action === 'pass').length;
  const out = jsonEvents(r).filter((e) => e.Test === name && e.Action === 'output').map((e) => e.Output).join('');
  assert.equal(n, 1, `${r.command}: test ${name} did not pass exactly once (passed ${n} times; status ${r.status})\n${out.slice(-3000)}\n${r.stdout.slice(-3000)}\n${r.stderr.slice(-2000)}`);
}

Given(P + 'a scratch copy of the repository', function () {
  this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-args-token-'));
  fs.cpSync(checkout, this.dir, { recursive: true, filter: (src) => !skipped.has(path.relative(checkout, src)) });
});

When(P + 'I run the independent args and token probe in the scratch copy', function () {
  fs.mkdirSync(path.join(this.dir, testkitDir), { recursive: true });
  fs.copyFileSync(probeFile, path.join(this.dir, testkitDir, 'args_token_probe_test.go'));
  this.run = run(this.dir, 'go', ['test', '-json', '-count=1', '-run', '^TestArgsTokenProbe$', './testkit/clauderuntime/']);
});

Then(P + 'these probe checks pass', function (table) {
  passed(this.run, 'TestArgsTokenProbe');
  for (const row of table.hashes()) passed(this.run, `TestArgsTokenProbe/${row.check}`);
  assert.equal(this.run.status, 0, `${this.run.command} failed\n${this.run.stdout.slice(-4000)}\n${this.run.stderr.slice(-2000)}`);
});

Then(P + 'the testkit test file calls both fixture accessors {string} and {string}', function (a, b) {
  const file = path.join(checkout, testkitDir, 'fixture_test.go');
  const text = fs.readFileSync(file, 'utf8');
  for (const accessor of [a, b]) {
    assert.ok(text.includes(accessor), `${path.relative(checkout, file)} never calls ${accessor}: the new behavior has no test of its own in the testkit`);
  }
});

When(P + 'I run the testkit and contract tests with the race detector', function () {
  this.run = run(checkout, 'go', ['test', '-race', '-count=1', './testkit/...', './contract/...']);
});

Then(P + 'the packages {string} and {string} pass', function (a, b) {
  for (const rel of [a, b]) {
    const re = new RegExp('^ok\\s+github\\.com/KogenAI/kogen-executor/' + rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s', 'm');
    assert.match(this.run.stdout, re, `${this.run.command}: package ${rel} did not report ok (status ${this.run.status})\n${this.run.stdout}\n${this.run.stderr.slice(-3000)}`);
  }
  assert.equal(this.run.status, 0, `${this.run.command} failed\n${this.run.stdout}\n${this.run.stderr.slice(-3000)}`);
});

When(P + 'I list the uncommitted changes under {string}', function (dir) {
  this.run = run(checkout, 'git', ['status', '--porcelain', '--', dir]);
  assert.equal(this.run.status, 0, `${this.run.command} failed: ${this.run.stderr}`);
});

Then(P + 'no file under {string} is changed', function (dir) {
  assert.equal(this.run.stdout, '', `${this.run.command} lists changes under ${dir}, but production code there must not change:\n${this.run.stdout}`);
});
