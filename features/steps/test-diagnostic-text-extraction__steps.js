const { Given, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const work = path.join(os.tmpdir(), 'kogen-test-diagnostic-text-extraction');

// Each mutant is a wrong implementation of core/util.go; the tests in core/util_test.go must fail on it.
const mutants = {
  'string content is treated as blocks': ['\tcase string:\n\t\treturn c\n', '\tcase string:\n\t\treturn ""\n'],
  'block text is joined without a separator': ['strings.Join(parts, "\\n")', 'strings.Join(parts, "")'],
  'a non-map block contributes text': ['\tif !ok {\n\t\treturn "", false\n\t}', '\tif !ok {\n\t\treturn "coerced", true\n\t}'],
  'a map without string text contributes text': ['\ttext, ok := m["text"].(string)\n\treturn text, ok', '\ttext, _ := m["text"].(string)\n\treturn text, true'],
  'unsupported content contributes text': ['\t\treturn strings.Join(parts, "\\n")\n\t}\n\treturn ""\n', '\t\treturn strings.Join(parts, "\\n")\n\t}\n\treturn "coerced"\n'],
};

function goTest(mutantName) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.cpSync(root, work, {
    recursive: true,
    filter: (src) => !['.git', 'node_modules'].includes(path.basename(src)),
  });
  if (mutantName) {
    const file = path.join(work, 'core', 'util.go');
    const source = fs.readFileSync(file, 'utf8');
    const [from, to] = mutants[mutantName];
    assert.ok(source.includes(from), `mutant "${mutantName}" does not apply to core/util.go`);
    fs.writeFileSync(file, source.replace(from, () => to));
  }
  return spawnSync('go', ['test', '-count=1', './core/'], { cwd: work, encoding: 'utf8', timeout: 100000 });
}

Given('test-diagnostic-text-extraction: the current core package', function () {
  assert.ok(fs.existsSync(path.join(root, 'core', 'util.go')), 'core/util.go exists');
});

Then('test-diagnostic-text-extraction: the core tests pass', { timeout: 120000 }, function () {
  const r = goTest(null);
  assert.equal(r.status, 0, `go test ./core/ on the unmodified tree failed:\n${r.stdout}${r.stderr}`);
});

Then('test-diagnostic-text-extraction: the core tests fail when {}', { timeout: 120000 }, function (name) {
  assert.ok(mutants[name], `unknown wrong implementation: ${name}`);
  const r = goTest(name);
  assert.notEqual(r.status, null, `go test ./core/ did not finish for "${name}"`);
  assert.notEqual(r.status, 0, `core tests still pass when ${name}:\n${r.stdout}${r.stderr}`);
  assert.ok(/--- FAIL/.test(r.stdout), `core tests failed for ${name} without a failing test (build error?):\n${r.stdout}${r.stderr}`);
});
