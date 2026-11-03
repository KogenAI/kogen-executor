'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
function run(which, control = '') {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.token-transport-'));
  try {
    for (const name of fs.readdirSync('executor/claudecode').filter(n => n.endsWith('.go') && !n.endsWith('_test.go'))) fs.copyFileSync(path.join('executor/claudecode', name), path.join(dir, name));
    fs.copyFileSync('features/steps/token_transport_test.go.txt', path.join(dir, 'token_transport_test.go'));
    // Compile the supplied independent driver; no Build-written test is required.
    const binary = path.join(dir, 'transport-driver');
    const compile = spawnSync('go', ['test', '-c', '-o', binary, './' + path.basename(dir)], {encoding:'utf8', timeout:180000});
    assert.equal(compile.status, 0, `compile supplied transport driver: ${compile.error || ''}\n${compile.stdout}${compile.stderr}`);
    const r = spawnSync(binary, ['-test.v', '-test.timeout=12s'], {encoding:'utf8', timeout:20000, env:{...process.env, TOKEN_TRANSPORT_CASE:which, TOKEN_TRANSPORT_CONTROL:control}});
    const text = (r.stdout || '') + (r.stderr || '');
    assert.ok(text.includes('=== RUN   TestTokenTransportAcceptance'), `supplied transport driver did not enter its observation: outcome ${r.status}\n${text}`);
    if (control === 'bad') {
      assert.notEqual(r.status, 0, 'transport driver bad control unexpectedly passed');
      assert.ok(text.includes('token bytes differ'), `transport driver bad control did not reach byte assertion; outcome ${r.status}\n${text}`);
    } else {
      assert.equal(r.status, 0, `transport driver ${which || control}: outcome ${r.status}; ${r.error || ''}\n${text}`);
      assert.ok(text.includes('TOKEN_TRANSPORT_OK'), `transport driver returned without completing observations: outcome ${r.status}\n${text}`);
    }
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
if (require.main === module) {
  const mode = process.argv[2];
  run('', mode);
  console.log(mode === 'bad' ? 'observer rejected byte corruption' : 'observer accepted real short-token lifecycle');
  if (mode === 'bad') process.exitCode = 1;
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I exercise token transport with {string} and {string}', {timeout:220000}, function(size, mode) { run(size + '/' + mode); this.tokenTransportReturned = true; });
  Then('token delivery returns privately without owned resources', function() { assert.equal(this.tokenTransportReturned, true); });
}
