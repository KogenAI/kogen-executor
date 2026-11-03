const { Then } = require('@cucumber/cucumber');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const assert = require('assert/strict');
Then('k-exec-nonbuild-wakeup-denied: Build framing remains exactly', {timeout:120000}, function(expected) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'k-frame-'));
 try {
  const file=path.join(dir,'main.go');
  const binary=path.join(dir,'reader');
  fs.writeFileSync(file,'package main\nimport("fmt"; "github.com/KogenAI/kogen-executor/executor/claudecode")\nfunc main(){fmt.Print(claudecode.Constraints)}\n');
  const build=cp.spawnSync('go',['build','-o',binary,file],{encoding:'utf8',timeout:90000});
  assert.equal(build.status,0,`go build framing reader: ${build.stderr}`);
  const r=cp.spawnSync(binary,[],{encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,`framing reader: ${r.stderr}`);
  assert.equal(r.stdout,expected);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
