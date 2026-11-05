'use strict';
// Observes TestFinalPersistenceFailures (executor/claudecode/persistence_test.go): its source and
// real go commands run in this checkout.
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const {When, Then} = require('@cucumber/cucumber');

const P = 'k-exec-final-persistence-test-portable: ';
const TEST = 'TestFinalPersistenceFailures';
const FILE = 'executor/claudecode/persistence_test.go';
const HEAD = 'func TestFinalPersistenceFailures(t *testing.T) {';

When(P + 'I read the body of TestFinalPersistenceFailures', function () {
  const src = fs.readFileSync(FILE, 'utf8');
  const start = src.indexOf(HEAD);
  assert.notEqual(start, -1, `${TEST}: ${FILE} has no ${JSON.stringify(HEAD)}`);
  const end = src.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${TEST}: no closing brace for ${TEST} in ${FILE}`);
  this.body = src.slice(start, end + 3);
});

Then(P + 'the body does not contain {string}', function (s) {
  assert.ok(!this.body.includes(s), `${TEST} in ${FILE} still contains ${JSON.stringify(s)}:\n${this.body}`);
});

Then(P + 'the body contains {string}', function (s) {
  assert.ok(this.body.includes(s), `${TEST} in ${FILE} no longer contains ${JSON.stringify(s)}:\n${this.body}`);
});

When(P + 'I run {string} in the checkout', {timeout: 300000}, function (cmd) {
  const r = cp.spawnSync('sh', ['-c', cmd], {encoding: 'utf8', timeout: 290000, maxBuffer: 16 * 1024 * 1024});
  this.run = {cmd, status: r.status, signal: r.signal, error: r.error, out: (r.stdout || '') + (r.stderr || '')};
});

function describe(run) {
  return `${TEST}: \`${run.cmd}\` exited ${run.status}${run.signal ? ' (signal ' + run.signal + ')' : ''}${run.error ? ' (' + run.error.message + ')' : ''}; output:\n${run.out}`;
}

Then(P + 'the command exits {int}', function (code) {
  assert.equal(this.run.status, code, describe(this.run));
});

Then(P + 'the output has a line starting with {string}', function (prefix) {
  const lines = this.run.out.split('\n').map((l) => l.trimStart());
  assert.ok(lines.some((l) => l.startsWith(prefix)), `missing a line starting with ${JSON.stringify(prefix)} (absent, skipped or not run). ${describe(this.run)}`);
});

Then(P + 'the output does not contain {string}', function (s) {
  assert.ok(!this.run.out.includes(s), `unexpected ${JSON.stringify(s)}. ${describe(this.run)}`);
});
