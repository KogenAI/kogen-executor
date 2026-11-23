const { Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

// Each mutant changes ShellDefinitions in a scratch copy of core/util.go in one way.
const mutants = {
  'returns the entries in reverse order': [
    '\treturn agent.AsAny(defs)\n',
    '\tfor i, j := 0, len(defs)-1; i < j; i, j = i+1, j-1 {\n\t\tdefs[i], defs[j] = defs[j], defs[i]\n\t}\n\treturn agent.AsAny(defs)\n',
  ],
  'moves the shell entry to the front': [
    '\t\t\tdefs[i], _ = t.Definition(name)\n',
    '\t\t\tdefs[i], _ = t.Definition(name)\n\t\t\tdefs[0], defs[i] = defs[i], defs[0]\n',
  ],
  'replaces every entry with the shell definition': [
    '\t\tif name == "shell" {\n\t\t\tdefs[i], _ = t.Definition(name)\n',
    '\t\tif name != "" {\n\t\t\tdefs[i], _ = t.Definition("shell")\n',
  ],
  'returns the generic shell definition': [
    '\t\t\tdefs[i], _ = t.Definition(name)\n',
    '\t\t\tdefs[i], _ = tools.Definition(name)\n',
  ],
  'drops the last entry': [
    '\treturn agent.AsAny(defs)\n',
    '\treturn agent.AsAny(defs[:len(defs)-1])\n',
  ],
  'appends an extra shell entry': [
    '\treturn agent.AsAny(defs)\n',
    '\textra, _ := t.Definition("shell")\n\treturn agent.AsAny(defs, []map[string]any{extra})\n',
  ],
  'reads the supplied tools when no shell is requested': [
    '\tdefs := agent.Defs(names...)\n',
    '\t_ = t.Root\n\tdefs := agent.Defs(names...)\n',
  ],
};

function copyTree(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip && skip(path.join(src, entry.name))) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(from, to, skip);
    else if (entry.isFile()) fs.writeFileSync(to, fs.readFileSync(from), { mode: 0o644 });
  }
}

// A scratch copy of the tree in which the supplied tools' Definition("shell") differs from the
// generic shell definition (it carries one extra key), as a runtime shell policy would make it.
function scratchCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsds-'));
  copyTree(root, path.join(dir, 'repo'), (src) => {
    const rel = path.relative(root, src);
    return rel === '.git' || rel === '.kogen';
  });
  const loopDir = execFileSync('go', ['list', '-m', '-f', '{{.Dir}}', 'github.com/KogenAI/kogen-loop'], { cwd: root, encoding: 'utf8' }).trim();
  const loopCopy = path.join(dir, 'loop');
  copyTree(loopDir, loopCopy);
  const defs = path.join(loopCopy, 'tools/defs.go');
  const before = 'func (t *Tools) Definition(name string) (map[string]any, bool) {\n\treturn Definition(name)\n}';
  const src = fs.readFileSync(defs, 'utf8');
  assert.ok(src.includes(before), 'kogen-loop Tools.Definition has an unexpected form');
  fs.writeFileSync(defs, src.replace(before, () => 'func (t *Tools) Definition(name string) (map[string]any, bool) {\n\td, ok := Definition(name)\n\tif ok && name == ShellTool {\n\t\td["runtime_policy"] = "supplied"\n\t}\n\treturn d, ok\n}'));
  const mod = path.join(dir, 'repo/go.mod');
  fs.appendFileSync(mod, `\nreplace github.com/KogenAI/kogen-loop => ${loopCopy}\n`);
  return { dir, repo: path.join(dir, 'repo') };
}

function goTestCore(repo) {
  const r = spawnSync('go', ['test', './core', '-count=1'], { cwd: repo, encoding: 'utf8', timeout: 100000 });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

Then('test-shell-definition-selection: the core tests fail when ShellDefinitions {string}', { timeout: 120000 }, function (change) {
  const mutant = mutants[change];
  assert.ok(mutant, `unknown change ${change}`);
  const head = execFileSync('git', ['show', 'HEAD:core/util.go'], { cwd: root, encoding: 'utf8' });
  assert.equal(fs.readFileSync(path.join(root, 'core/util.go'), 'utf8'), head, 'core/util.go differs from HEAD');
  const { dir, repo } = scratchCopy();
  try {
    const base = goTestCore(repo);
    assert.equal(base.status, 0, `go test ./core failed on the unchanged ShellDefinitions:\n${base.output}`);
    const file = path.join(repo, 'core/util.go');
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(src.includes(mutant[0]), `core/util.go does not contain the text to change for "${change}"`);
    fs.writeFileSync(file, src.replace(mutant[0], () => mutant[1]));
    const r = goTestCore(repo);
    assert.ok(!/\[build failed\]|\[setup failed\]/.test(r.output), `the changed ShellDefinitions did not compile for "${change}":\n${r.output}`);
    assert.notEqual(r.status, 0, `go test ./core passed although ShellDefinitions ${change}`);
    assert.match(r.output, /--- FAIL: /, `go test ./core reported no failing test although ShellDefinitions ${change}:\n${r.output}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
