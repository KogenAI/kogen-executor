const {Then} = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
function observe(expression) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin318-'));
  try {
    const src = path.join(dir, 'main.go');
    fs.writeFileSync(src, 'package main\nimport("fmt"; cc "github.com/KogenAI/kogen-executor/executor/claudecode")\nfunc main(){fmt.Print(' + expression + ')}\n');
    return execFileSync('go', ['run', src], {cwd: process.cwd(), encoding:'utf8', timeout:120000});
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
}
Then('e-claude-code-2-1-318: Version is {string}', function(expected) {
  assert.equal(observe('cc.Version'), expected);
});
Then('e-claude-code-2-1-318: the managed path for {string} is {string}', function(home, expected) {
  assert.equal(observe('cc.RuntimePath(' + JSON.stringify(home) + ')'), expected);
});
Then('e-claude-code-2-1-318: refusal for {string} reporting {string} is {string}', function(file, answer, expected) {
  assert.equal(observe('cc.NotPinnedMessage(' + JSON.stringify(file) + ',' + JSON.stringify(answer) + ')'), expected);
});
