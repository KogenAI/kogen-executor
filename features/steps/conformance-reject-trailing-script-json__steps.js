'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const PREFIX = 'conformance-reject-trailing-script-json: ';
const DRIVER = path.join(__dirname, 'conformance-reject-trailing-script-json__driver/main.go');

function copyGoSources(from, to) {
  fs.mkdirSync(to, {recursive: true});
  for (const name of fs.readdirSync(from)) {
    if (name.endsWith('.go') && !name.endsWith('_test.go')) {
      fs.copyFileSync(path.join(from, name), path.join(to, name));
    }
  }
}

function loadScript(filename, content) {
  assert.equal(path.basename(filename), filename, 'fixture must be a filename');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conformance-json-'));
  try {
    for (const name of ['go.mod', 'go.sum']) fs.copyFileSync(path.join(ROOT, name), path.join(dir, name));
    copyGoSources(path.join(ROOT, 'executor'), path.join(dir, 'executor'));
    const target = path.join(dir, 'executor/conformance');
    copyGoSources(path.join(ROOT, 'executor/conformance'), target);
    fs.mkdirSync(path.join(target, 'scripts'));
    fs.writeFileSync(path.join(target, 'scripts', filename), content);
    fs.mkdirSync(path.join(dir, 'driver'));
    fs.copyFileSync(DRIVER, path.join(dir, 'driver/main.go'));
    const binary = path.join(dir, 'loader');
    const built = spawnSync('go', ['build', '-o', binary, './driver'], {
      cwd: dir, encoding: 'utf8', timeout: 90000,
    });
    assert.equal(built.status, 0, `go build ./driver failed: ${built.error || ''}\n${built.stdout}${built.stderr}`);
    const run = spawnSync(binary, [], {cwd: dir, encoding: 'utf8', timeout: 10000});
    assert.equal(run.status, 0, `compiled Scripts driver failed: ${run.error || ''}\n${run.stdout}${run.stderr}`);
    return JSON.parse(run.stdout);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

function accepted(result, name) {
  assert.equal(result.error, '', `Scripts rejected valid trailing whitespace: ${result.error}`);
  assert.deepEqual(result.names, [name], 'Scripts must return the decoded script');
}

function rejected(result, filename) {
  assert.ok(typeof result.error === 'string' && result.error.length > 0,
    'Scripts accepted trailing content instead of returning an error');
  assert.ok(result.error.includes(filename), `Scripts error must name ${filename}: ${result.error}`);
}

// Qualify the final observer and compiled driver on outcomes already supported
// by the unchanged loader. These are observer controls, not extra product rules.
function observer(mode) {
  const filename = 'finish_after_write.json';
  const valid = loadScript(filename, '{"name":"finish_after_write"} \t\r\n');
  const invalid = loadScript(filename, '{');
  if (mode === 'good') {
    accepted(valid, 'finish_after_write');
    rejected(invalid, filename);
    console.log('observer good');
    return;
  }
  assert.equal(mode, 'bad');
  const checks = [
    () => accepted({...valid, error: 'unexpected rejection'}, 'finish_after_write'),
    () => accepted({...valid, names: []}, 'finish_after_write'),
    () => rejected({...invalid, error: ''}, filename),
    () => rejected({...invalid, error: 'trailing content'}, filename),
  ];
  for (const check of checks) assert.throws(check, assert.AssertionError);
  console.log('observer rejected bad controls');
  process.exitCode = 1;
}

if (require.main === module) {
  observer(process.argv[2]);
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  Given(PREFIX + 'the isolated embedded file {string} has these JSON-encoded bytes:', function (filename, text) {
    this.trailingScript = {filename, content: JSON.parse(text)};
  });
  When(PREFIX + 'I load the embedded scripts through Scripts', {timeout: 115000}, function () {
    this.trailingResult = loadScript(this.trailingScript.filename, this.trailingScript.content);
  });
  Then(PREFIX + 'loading succeeds with script {string}', function (name) {
    accepted(this.trailingResult, name);
  });
  Then(PREFIX + 'loading fails with an error naming {string}', function (filename) {
    rejected(this.trailingResult, filename);
  });
}
