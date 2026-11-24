const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const original = 'func NonNil[T any](s []T) []T {\n\tif s == nil {\n\t\treturn []T{}\n\t}\n\treturn s\n}';
const mutations = {
  nil: [
    ['nil-preserving implementation', 'return s'],
    ['nonempty-for-nil implementation', 'if s == nil { return make([]T, 1) }; return s'],
  ],
  populated: [
    ['always-empty implementation', 'return []T{}'],
    ['order-reversing implementation', 'out := append([]T{}, s...); for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 { out[i], out[j] = out[j], out[i] }; return out'],
    ['element-dropping implementation', 'if len(s) > 0 { return s[1:] }; return []T{}'],
  ],
};

function runTests(dir) {
  const args = ['test', '-json', '-count=1', path.join(dir, 'util.go'), path.join(dir, 'util_test.go')];
  const result = spawnSync('go', args, { cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const context = `go ${args.join(' ')}: status=${result.status}, error=${result.error || ''}\n${output}`;
  assert.ok(!result.error && result.signal === null, context);
  const events = (result.stdout || '').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const runs = events.filter(e => e.Test && e.Action === 'run').map(e => e.Test);
  assert.ok(runs.length > 0, `No tests ran: ${context}`);
  for (const name of runs) {
    assert.equal(events.filter(e => e.Test === name && ['pass', 'fail'].includes(e.Action)).length, 1, `Test ${name} absent, skipped, or incomplete: ${context}`);
  }
  assert.ok(!events.some(e => e.Action === 'skip'), `Skipped tests: ${context}`);
  const failed = events.some(e => e.Test && e.Action === 'fail');
  assert.ok(events.some(e => !e.Test && e.Action === (failed ? 'fail' : 'pass')), `Missing package outcome: ${context}`);
  assert.equal(result.status, failed ? 1 : 0, context);
  return !failed;
}

function observe(mode, testfile = 'core/util_test.go') {
  assert.ok(mutations[mode], `Unknown mode: ${mode}`);
  const source = fs.readFileSync(path.join(root, 'core/util.go'), 'utf8');
  const tests = fs.readFileSync(path.resolve(root, testfile), 'utf8');
  assert.equal(source.split(original).length, 2, 'NonNil scratch mutation anchor must be unique');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonnil-tests-'));
  try {
    fs.writeFileSync(path.join(dir, 'util.go'), source);
    fs.writeFileSync(path.join(dir, 'util_test.go'), tests);
    assert.ok(runTests(dir), 'utility tests fail with unchanged NonNil');
    for (const [name, body] of mutations[mode]) {
      fs.writeFileSync(path.join(dir, 'util.go'), source.replace(original, `func NonNil[T any](s []T) []T { ${body} }`));
      assert.equal(runTests(dir), false, `${name} survived`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    observe(...process.argv.slice(2));
    process.stdout.write('verified\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
} else {
  const { Given, Then } = require('@cucumber/cucumber');
  Given('core-nonnil-slice-tests: the utility source and test file exist', function () {
    for (const file of ['core/util.go', 'core/util_test.go']) assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
  });
  Then('core-nonnil-slice-tests: direct tests require a non-nil zero-length result for a nil slice', { timeout: 120000 }, function () {
    observe('nil');
  });
  Then('core-nonnil-slice-tests: direct tests require populated elements in their original order', { timeout: 120000 }, function () {
    observe('populated');
  });
}
