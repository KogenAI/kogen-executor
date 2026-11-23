const { Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

// Each mutant changes EncodeJSON in a scratch copy of core/util.go in one way.
const mutants = {
  'escapes HTML characters': [
    '\tenc.SetEscapeHTML(false)\n',
    '',
  ],
  'keeps the final newline': [
    '\treturn bytes.TrimSuffix(b.Bytes(), []byte("\\n")), nil\n}',
    '\treturn b.Bytes(), nil\n}',
  ],
  'swallows the encoding error': [
    '\tif err := enc.Encode(v); err != nil {\n\t\treturn nil, err\n\t}\n',
    '\tif err := enc.Encode(v); err != nil {\n\t\treturn bytes.TrimSuffix(b.Bytes(), []byte("\\n")), nil\n\t}\n',
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

Then('test-encode-json-contract: the core tests fail when EncodeJSON {string}', { timeout: 120000 }, function (change) {
  const mutant = mutants[change];
  assert.ok(mutant, `unknown change ${change}`);
  const head = execFileSync('git', ['show', 'HEAD:core/util.go'], { cwd: root, encoding: 'utf8' });
  assert.equal(fs.readFileSync(path.join(root, 'core/util.go'), 'utf8'), head, 'core/util.go differs from HEAD');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tejc-'));
  try {
    const repo = path.join(dir, 'repo');
    copyTree(root, repo, (src) => {
      const rel = path.relative(root, src);
      return rel === '.git' || rel === '.kogen';
    });
    const base = goTestCore(repo);
    assert.equal(base.status, 0, `go test ./core failed on the unchanged EncodeJSON:\n${base.output}`);
    const file = path.join(repo, 'core/util.go');
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(src.includes(mutant[0]), `core/util.go does not contain the text to change for "${change}"`);
    fs.writeFileSync(file, src.replace(mutant[0], () => mutant[1]));
    const r = goTestCore(repo);
    assert.ok(!/\[build failed\]|\[setup failed\]/.test(r.output), `the changed EncodeJSON did not compile for "${change}":\n${r.output}`);
    assert.notEqual(r.status, 0, `go test ./core passed although EncodeJSON ${change}`);
    assert.match(r.output, /--- FAIL: /, `go test ./core reported no failing test although EncodeJSON ${change}:\n${r.output}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
