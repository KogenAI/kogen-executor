const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
const driver = require('./k-exec-install-download-stall__driver.js');

function observe(r, mode, reason, maxMs, notice) {
  assert.equal(r.mode, mode, 'reported fixture mode');
  assert.equal(r.finished, true, 'installer must finish without watchdog');
  assert.equal(r.partials, 0, 'no partial directory remains');
  assert.equal(r.lockFree, true, 'install.lock must be immediately acquirable');
  assert.ok(r.elapsed < maxMs, `installer elapsed ${r.elapsed} must be below ${maxMs}`);
  if (mode === 'slow') {
    assert.equal(r.error, '', 'moving download succeeds');
    assert.equal(r.installed, true, 'verified runtime installed');
    assert.ok(r.elapsed > 600, 'moving transfer exceeds one idle period');
  } else {
    assert.ok(r.error.includes('executor/' + reason), `expected executor/${reason}: ${r.error}`);
    if (mode === 'stall' || mode === 'handoff') {
      assert.match(r.error, /stalled/i, 'stall diagnostic');
      assert.equal(r.source, true, 'stall diagnostic names exact source');
    } else assert.doesNotMatch(r.error, /stalled/i, 'caller cancellation is not a stall');
    assert.equal(r.installed, mode === 'handoff', 'only healthy successor installs');
  }
  assert.equal(r.notices, notice, 'waiting notice count');
  if (mode === 'handoff') {
    assert.equal(r.secondDone, true, 'successor completes');
    assert.equal(r.secondError, '', 'healthy successor succeeds');
  }
}
function namedBound(source,name,seconds) {
  assert.ok(source.includes(`const ${name} = ${seconds} * time.Second`), `named default ${name} must be ${seconds} seconds`);
}
function control(bad) {
  const modes = ['stall','slow','handoff','cancel','deadline'];
  let rejected = 0;
  namedBound('const downloadIdleTimeout = 30 * time.Second','downloadIdleTimeout',30);
  if(bad){assert.throws(()=>namedBound('','downloadIdleTimeout',30));rejected++;}
  for (const mode of modes) {
    const reason = mode === 'cancel' ? 'interrupted' : mode === 'deadline' ? 'deadline' : 'unavailable';
    const r = {mode,finished:true,partials:0,lockFree:true,elapsed:mode === 'slow'?1200:600,error:mode === 'slow'?'':`executor/${reason}: connection stalled`,source:true,installed:mode==='slow'||mode==='handoff',notices:mode==='handoff'?1:0,secondDone:true,secondError:''};
    if (mode==='cancel'||mode==='deadline') r.error=`executor/${reason}: cancelled`;
    const args = [mode,reason,3000,mode==='handoff'?1:0];
    observe(r,...args);
    if (bad) {
      const changes = {finished:false,partials:1,lockFree:false,elapsed:4000,error:mode==='slow'?'failed':'wrong classification',installed:!r.installed,notices:r.notices+1};
      if(mode==='slow') changes.elapsed=100;
      if(mode==='stall'||mode==='handoff') changes.source=false;
      if(mode==='handoff'){changes.secondDone=false;changes.secondError='failed';}
      for(const [k,v] of Object.entries(changes)) {
        let failed=false;
        try {observe({...r,[k]:v},...args);} catch { failed=true; }
        assert.ok(failed, `control must reject ${mode}.${k}`); rejected++;
      }
    }
  }
  if (bad) { assert.ok(rejected>0); console.log('bad fixtures rejected'); process.exitCode=1; }
  else console.log('good fixtures accepted');
}
if (require.main === module) control(process.argv[2] === 'bad');
else {
 const {When,Then} = require('@cucumber/cucumber');
 When('k-exec-install-download-stall: I install against the {string} local origin using the internal idle seam', {timeout:120000}, function(mode) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'stall-acceptance-'));
  try {
   const repo=process.cwd();
   this.boundSource=fs.readFileSync(path.join(repo,'executor/claudecode/runtime.go'),'utf8');
   cp.execFileSync('git',['clone','--quiet','--no-hardlinks',repo,path.join(tmp,'repo')]);
   const copy=path.join(tmp,'repo');
   for (const dir of ['executor','testproc']) fs.cpSync(path.join(repo,dir),path.join(copy,dir),{recursive:true});
   for (const name of ['go.mod','go.sum']) fs.copyFileSync(path.join(repo,name),path.join(copy,name));
   // The optional interface leaves the old tree compilable. Without the seam,
   // the no-deadline stall must fail the behavioral bound, not compilation.
   const source=driver.replace('err := installer(os.Getenv("STALL_HOME"),nil).ensureRuntime(ctx)','a := installer(os.Getenv("STALL_HOME"),nil)\n a.opts.Stderr = os.Stderr\n if seam, ok := any(a).(interface { setDownloadIdleTimeoutForTest(time.Duration) }); ok { seam.setDownloadIdleTimeoutForTest(600*time.Millisecond) }\n err := a.ensureRuntime(ctx)');
   fs.writeFileSync(path.join(copy,'executor/claudecode/stall_acceptance_test.go'),source);
   const binary=path.join(tmp,'driver');
   cp.execFileSync('go',['test','-c','-o',binary,'./executor/claudecode'],{cwd:copy,timeout:90000,stdio:'pipe'});
   const report=path.join(tmp,'report.json');
   cp.execFileSync(binary,['-test.run=^TestStallAcceptanceDriver$','-test.timeout=20s'],{cwd:copy,timeout:25000,env:{...process.env,STALL_MODE:mode,STALL_REPORT:report},stdio:'pipe'});
   this.stallReport=JSON.parse(fs.readFileSync(report,'utf8'));
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
 });
 Then('k-exec-install-download-stall: the {string} result is {string} within {int} milliseconds with {int} waiting notices',function(mode,reason,maxMs,notice){observe(this.stallReport,mode,reason,maxMs,notice);});
 Then('k-exec-install-download-stall: the named default {string} is {int} seconds',function(name,seconds){namedBound(this.boundSource,name,seconds);});
}
