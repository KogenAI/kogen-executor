const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
function observe(input, digest, testfile) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'hashhex-driver-'));
  try {
    const binary = path.join(scratch, 'observer');
    const build = spawnSync('go', ['build', '-o', binary, path.join(__dirname, 'core-hashhex-test-vectors__driver/main.go')], { cwd: root, encoding: 'utf8', timeout: 25000 });
    assert.equal(build.status, 0, `building HashHex observer failed: ${build.error || ''}\n${build.stdout}${build.stderr}`);
    const result = spawnSync(binary, [input, digest, testfile], { cwd: root, encoding: 'utf8', timeout: 85000 });
    assert.equal(result.status, 0, `${result.error || ''}${result.stdout}${result.stderr}`);
    assert.equal(result.stdout, 'verified\n');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
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
  Given('core-hashhex-test-vectors: the utility source and direct test file are present', function () {
    for (const file of ['core/util.go', 'core/util_test.go']) assert.ok(fs.statSync(path.join(root, file)).isFile(), file);
  });
  Then('core-hashhex-test-vectors: direct tests pin input {string} to {string} and reject a same-length incorrect digest', { timeout: 120000 }, function (input, digest) {
    observe(input, digest, 'core/util_test.go');
  });
}
