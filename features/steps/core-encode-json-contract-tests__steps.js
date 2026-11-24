const { Given, Then, AfterAll } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
let scratch;
let binary;
function observer(mode) {
  if (!binary) {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'encode-json-driver-'));
    binary = path.join(scratch, 'observer');
    const build = spawnSync('go', ['build', '-o', binary, path.join(__dirname, 'core-encode-json-contract-tests__driver/main.go')], { cwd: root, encoding: 'utf8', timeout: 55000 });
    assert.equal(build.status, 0, `building EncodeJSON observer failed: ${build.error || ''}\n${build.stdout}${build.stderr}`);
  }
  const result = spawnSync(binary, [mode, 'core/util_test.go'], { cwd: root, encoding: 'utf8', timeout: 55000 });
  assert.equal(result.status, 0, `EncodeJSON ${mode} check failed: ${result.error || ''}\n${result.stdout}${result.stderr}`);
  assert.equal(result.stdout, 'verified\n');
}
Given('core-encode-json-contract-tests: the utility source and direct test file are present', function () {
  for (const file of ['core/util.go', 'core/util_test.go']) assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
});
Then('core-encode-json-contract-tests: a direct test decodes the successful result', { timeout: 120000 }, function () { observer('decode'); });
Then('core-encode-json-contract-tests: the direct tests reject the {string} regression', { timeout: 120000 }, function (mode) { observer(mode); });
AfterAll(function () { if (scratch) fs.rmSync(scratch, { recursive: true, force: true }); });
