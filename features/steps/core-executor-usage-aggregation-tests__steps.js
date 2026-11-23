const { Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

// Each wrong change edits ExecutorUsage.Plus (or addCounts) in a scratch copy of core/state.go.
const mutants = {
  'replaces the totals instead of adding': [
    ['\treturn Count(*a + *b)\n', '\treturn Count(*b)\n'],
  ],
  'retains the older source': [
    ['\tif r.Source != "" {\n', '\tif r.Source != "" && u.Source == "" {\n'],
  ],
  'treats a missing count or cost as zero': [
    ['\tif a == nil || b == nil {\n\t\treturn nil\n\t}\n\treturn Count(*a + *b)\n',
      '\tx, y := 0, 0\n\tif a != nil {\n\t\tx = *a\n\t}\n\tif b != nil {\n\t\ty = *b\n\t}\n\treturn Count(x + y)\n'],
  ],
  'discards the known totals when a count is unknown': [
    ['\tif r.Source != "" {\n',
      '\tif out.Input == nil || out.Cached == nil || out.Output == nil || out.Reasoning == nil {\n\t\tout.Input, out.Cached, out.Output, out.Reasoning = nil, nil, nil, nil\n\t}\n\tif r.Source != "" {\n'],
  ],
  'marks the first round partial': [
    ['\tcase first || state == u.State:\n', '\tcase state == u.State:\n'],
  ],
  'accepts a conflicting later state': [
    ['\tcase first || state == u.State:\n', '\tcase true:\n'],
  ],
  'leaves an empty round state empty': [
    ['\t\tstate = executor.UsageUnknown\n', '\t\tstate = ""\n'],
  ],
};

function copyTree(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    if (skip && skip(from)) continue;
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(from, to, skip);
    else if (entry.isFile()) fs.writeFileSync(to, fs.readFileSync(from), { mode: 0o644 });
  }
}

function goTestCore(repo) {
  const r = spawnSync('go', ['test', './core', '-count=1'], { cwd: repo, encoding: 'utf8', timeout: 100000 });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

Then('core-executor-usage-aggregation-tests: the core tests fail when ExecutorUsage.Plus {string}', { timeout: 120000 }, function (change) {
  const edits = mutants[change];
  assert.ok(edits, `unknown change ${change}`);
  const head = execFileSync('git', ['show', 'HEAD:core/state.go'], { cwd: root, encoding: 'utf8' });
  assert.equal(fs.readFileSync(path.join(root, 'core/state.go'), 'utf8'), head, 'core/state.go differs from HEAD');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceuat-'));
  try {
    const repo = path.join(dir, 'repo');
    copyTree(root, repo, (src) => {
      const rel = path.relative(root, src);
      return rel === '.git' || rel === '.kogen';
    });
    const base = goTestCore(repo);
    assert.equal(base.status, 0, `go test ./core failed on the unchanged ExecutorUsage.Plus:\n${base.output}`);
    assert.ok(fs.existsSync(path.join(repo, 'core/state_test.go')), 'core/state_test.go does not exist');
    const file = path.join(repo, 'core/state.go');
    let src = fs.readFileSync(file, 'utf8');
    for (const [from, to] of edits) {
      assert.ok(src.includes(from), `core/state.go does not contain the text to change for "${change}"`);
      src = src.replace(from, () => to);
    }
    fs.writeFileSync(file, src);
    const r = goTestCore(repo);
    assert.ok(!/\[build failed\]|\[setup failed\]/.test(r.output), `the changed ExecutorUsage.Plus did not compile for "${change}":\n${r.output}`);
    assert.notEqual(r.status, 0, `go test ./core passed although ExecutorUsage.Plus ${change}`);
    assert.match(r.output, /--- FAIL: /, `go test ./core reported no failing test although ExecutorUsage.Plus ${change}:\n${r.output}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
