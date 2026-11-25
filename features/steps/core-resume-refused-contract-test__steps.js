const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const utility = path.join(root, 'core/util.go');
const tests = path.join(root, 'core/util_test.go');

function runTests(source, test) {
  const args = ['test', '-json', '-count=1', source, test];
  const result = spawnSync('go', args, {
    cwd: root,
    env: { ...process.env, GOFLAGS: '-trimpath' },
    encoding: 'utf8',
    timeout: 18000,
  });
  const context = `go ${args.join(' ')}: status=${result.status}, signal=${result.signal}, error=${result.error || ''}\n${result.stdout || ''}${result.stderr || ''}`;
  assert.ok(!result.error && !result.signal, context);
  const events = (result.stdout || '').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const pkg = 'command-line-arguments';
  const outcome = events.filter(e => e.Package === pkg && !e.Test && ['pass', 'fail'].includes(e.Action));
  assert.equal(outcome.length, 1, `No single package result from executed utility tests:\n${context}`);
  const ran = new Set(events.filter(e => e.Package === pkg && e.Test && e.Action === 'run').map(e => e.Test));
  const passed = outcome[0].Action === 'pass';
  const completed = events.filter(e => e.Package === pkg && ran.has(e.Test) && e.Action === (passed ? 'pass' : 'fail'));
  assert.ok(completed.length > 0, `No completed test with the package outcome:\n${context}`);
  assert.equal(result.status, passed ? 0 : 1, context);
  if (!passed) {
    assert.ok(!events.some(e => /(?:^|\n)panic:/.test(e.Output || '')), `Unexpected test panic:\n${context}`);
    assert.ok(completed.some(({ Test }) => events.some(e => e.Package === pkg && e.Test === Test &&
      e.Action === 'output' && /^\s*util_test\.go:\d+:/.test(e.Output || ''))),
    `Expected a failing assertion in util_test.go:\n${context}`);
  }
  return passed;
}

function observe(mode, errorClass, reason, exit, testfile = tests) {
  const empty = mode === 'empty';
  assert.ok(empty || mode === 'supplied', `Unknown detail case: ${mode}`);
  const args = [JSON.stringify(errorClass), JSON.stringify(reason), 'detail', String(exit)];
  const fail = values => `return sys.Fail(${values.join(', ')})`;
  const anchor = fail(args);
  const source = fs.readFileSync(utility, 'utf8');
  assert.equal(source.split(anchor).length, 2, 'Expected one ResumeRefused return to mutate');
  const cases = empty ? [
    ['invented empty detail', 2, '"No detail was supplied"'],
    ['wrong class', 0, '"unexpected_class"'],
    ['wrong reason', 1, '"unexpected_reason"'],
    ['wrong exit code', 3, String(exit + 1)],
  ] : [
    ['wrong class', 0, '"unexpected_class"'],
    ['wrong reason', 1, '"unexpected_reason"'],
    ['lost detail', 2, '""'],
    ['changed detail', 2, 'detail + " (changed)"'],
    ['wrong exit code', 3, String(exit + 1)],
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-refused-'));
  try {
    const sourcePath = path.join(dir, 'util.go');
    const testPath = path.join(dir, 'util_test.go');
    fs.copyFileSync(testfile, testPath);
    fs.writeFileSync(sourcePath, source);
    if (!runTests(sourcePath, testPath)) throw new Error('Utility tests fail against the unchanged helper');
    for (const [label, index, value] of cases) {
      const changed = args.slice();
      changed[index] = value;
      const comparison = empty ? '==' : '!=';
      const branch = `if detail ${comparison} "" { ${fail(changed)} }\n\t${anchor}`;
      fs.writeFileSync(sourcePath, source.replace(anchor, branch));
      if (runTests(sourcePath, testPath)) throw new Error(`${mode} detail: ${label} survived the utility tests`);
    }
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

if (require.main === module) {
  try {
    const [mode, errorClass, reason, exit, testfile] = process.argv.slice(2);
    observe(mode, errorClass, reason, Number(exit), testfile);
    process.stdout.write('verified\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
} else {
  const { Given, Then } = require('@cucumber/cucumber');
  Given('core-resume-refused-contract-test: the utility source and test file are present', function () {
    for (const file of [utility, tests]) assert.ok(fs.statSync(file).isFile(), file);
  });
  Then('core-resume-refused-contract-test: the direct tests require class {string}, reason {string}, unchanged supplied detail and exit code {int}', { timeout: 115000 }, function (errorClass, reason, exit) {
    observe('supplied', errorClass, reason, exit);
  });
  Then('core-resume-refused-contract-test: the direct tests require class {string}, reason {string}, empty detail and exit code {int} when detail is empty', { timeout: 115000 }, function (errorClass, reason, exit) {
    observe('empty', errorClass, reason, exit);
  });
}
