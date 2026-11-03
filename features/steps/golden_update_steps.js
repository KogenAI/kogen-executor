// Steps for the go test -update path of the golden files: every Go command runs in a scratch
// copy of this checkout, so the checkout's own goldens stay untouched.
const { After, Given, Then, When } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const checkout = path.resolve(__dirname, '..', '..');
const goTimeout = 10 * 60 * 1000;
const skipped = new Set(['.git', 'node_modules', path.join('.kogen', 'local')]);

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
// canonical is JSON with object keys sorted at every level; array order is kept.
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v !== null && typeof v === 'object'
      ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
      : JSON.stringify(v);

function goEnv() {
  return { ...process.env, GOPRIVATE: process.env.GOPRIVATE || 'github.com/KogenAI/*' };
}

function scratch(world, file) {
  assert.ok(world.dir, 'no scratch copy: start with "a scratch copy of the repository"');
  return path.join(world.dir, file);
}

function readJSON(file) {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    assert.fail(`${file} is not JSON (${err.message}):\n${text.slice(0, 400)}`);
  }
}

After(function () {
  if (this.dir) fs.rmSync(this.dir, { recursive: true, force: true });
});

Given('a scratch copy of the repository', function () {
  this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-golden-'));
  this.written = {};
  fs.cpSync(checkout, this.dir, {
    recursive: true,
    filter: (src) => !skipped.has(path.relative(checkout, src)),
  });
});

Given('the scratch file {string} is left with an unresolved merge conflict', function (file) {
  const original = fs.readFileSync(scratch(this, file), 'utf8');
  const theirs = original.replace(/[0-9a-f]{64}/, '0'.repeat(64));
  assert.notEqual(theirs, original, `${file} holds no SHA-256 to change`);
  const text = `<<<<<<< HEAD\n${original}=======\n${theirs}>>>>>>> theirs\n`;
  fs.writeFileSync(scratch(this, file), text);
  this.written[file] = Buffer.from(text);
});

Given('the scratch golden {string} has the {string} description replaced by {string}', function (file, name, text) {
  const golden = readJSON(scratch(this, file));
  assert.ok(golden[name], `${file} has no ${name} entry`);
  assert.notEqual(golden[name].description, text);
  golden[name].description = text;
  const bytes = Buffer.from(JSON.stringify(golden) + '\n');
  fs.writeFileSync(scratch(this, file), bytes);
  this.written[file] = bytes;
});

Given('the scratch file {string} ends with the extra line {string}', function (file, line) {
  fs.appendFileSync(scratch(this, file), line + '\n');
});

When('I run {string} in the scratch copy', { timeout: goTimeout + 60 * 1000 }, function (command) {
  const run = spawnSync('sh', ['-c', command], {
    cwd: scratch(this, '.'),
    env: goEnv(),
    encoding: 'utf8',
    timeout: goTimeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.error, undefined, `${command} did not run: ${run.error}`);
  this.command = command;
  this.status = run.status;
  this.output = (run.stdout || '') + (run.stderr || '');
});

Then('the command succeeds', function () {
  assert.equal(this.status, 0, `${this.command} exited ${this.status}:\n${this.output}`);
});

Then('the command fails', function () {
  assert.notEqual(this.status, 0, `${this.command} exited 0:\n${this.output}`);
});

Then('the output contains {string}', function (text) {
  assert.ok(this.output.includes(text), `${this.command} output lacks ${JSON.stringify(text)}:\n${this.output}`);
});

Then('the output reports these packages as ok:', function (table) {
  for (const [pkg] of table.raw()) {
    const ok = new RegExp('^ok\\s+' + pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s', 'm');
    assert.match(this.output, ok, `${this.command} did not report ok for ${pkg}:\n${this.output}`);
  }
});

Then('the scratch file {string} still holds the bytes written to it', function (file) {
  assert.ok(this.written[file], `no bytes were written to ${file}`);
  assert.ok(fs.readFileSync(scratch(this, file)).equals(this.written[file]), `${this.command} changed ${file}`);
});

Then("the scratch file {string} is byte-identical to the checkout's", function (file) {
  const got = fs.readFileSync(scratch(this, file));
  const want = fs.readFileSync(path.join(checkout, file));
  assert.ok(
    got.equals(want),
    `${file} after ${this.command} differs from the checkout's:\n--- scratch\n${got.toString('utf8').slice(0, 2000)}\n--- checkout\n${want.toString('utf8').slice(0, 2000)}`,
  );
});

Then("the scratch golden {string} differs from the checkout's only in its {string} entry", function (file, name) {
  const got = readJSON(scratch(this, file));
  const want = readJSON(path.join(checkout, file));
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), `${file} entries changed`);
  for (const key of Object.keys(want)) {
    if (key === name) assert.notDeepEqual(got[key], want[key], `${file} entry ${key} did not change`);
    else assert.deepEqual(got[key], want[key], `${file} entry ${key} changed`);
  }
});

Then('the scratch prompts golden entry {string} records the bytes and SHA-256 of the scratch file {string}', function (name, file) {
  const golden = readJSON(scratch(this, 'agent/testdata/prompts_golden.json'));
  const text = fs.readFileSync(scratch(this, file));
  assert.deepEqual(golden[name], { bytes: text.length, sha256: sha256(text) });
});

Then('the checkout file {string} has SHA-256 {string}', function (file, want) {
  assert.equal(sha256(fs.readFileSync(path.join(checkout, file))), want, `${file} bytes changed`);
});

Then('the checkout golden {string} holds the JSON value with canonical SHA-256 {string}', function (file, want) {
  assert.equal(sha256(canonical(readJSON(path.join(checkout, file)))), want, `${file} values changed`);
});

Then('the checkout file {string} contains {string}', function (file, text) {
  const content = fs.readFileSync(path.join(checkout, file), 'utf8');
  assert.ok(content.includes(text), `${file} lacks ${JSON.stringify(text)}`);
});

Then('the module has the package {string} and no non-test package imports it', function (pkg) {
  const run = spawnSync('go', ['list', '-f', '{{.ImportPath}}:{{range .Imports}} {{.}}{{end}}', './...'], {
    cwd: checkout,
    env: goEnv(),
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `go list failed:\n${run.stdout}${run.stderr}`);
  const lines = run.stdout.trim().split('\n');
  assert.ok(lines.some((l) => l.split(':')[0] === pkg), `go list ./... lacks ${pkg}:\n${run.stdout}`);
  const importers = lines.filter((l) => l.split(':')[1].split(' ').includes(pkg)).map((l) => l.split(':')[0]);
  assert.deepEqual(importers, [], `non-test code imports ${pkg}`);
});
