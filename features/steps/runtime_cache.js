const assert = require('node:assert/strict');
const cp = require('node:child_process');
function observe(actual, expected) { assert.deepStrictEqual(actual, expected); }
if (require.main === module) {
  const expected = {initial:'claude-code 2.1.312 (Claude Code)',observed:'claude-code 2.1.312 (Claude Code)',started:true,reason:'none',replacementDiagnostic:false,auth:1,task:0,events:1};
  const actual = JSON.parse(require('node:fs').readFileSync(0,'utf8'));
  if (process.argv[2] === 'bad') actual.auth = 0;
  try { observe(actual, expected); console.log('accepted'); }
  catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('the observed managed runtime is subjected to {string}', function(mode) {
    const r = cp.spawnSync('go',['run','./features/steps/runtime_cache_driver',mode],{encoding:'utf8',timeout:120000});
    assert.equal(r.status,0,`runtime driver: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
    this.runtimeCache = JSON.parse(r.stdout);
  });
  Then('the runtime cache observation is', function(text) { observe(this.runtimeCache,JSON.parse(text)); });
}
