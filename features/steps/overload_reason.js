'use strict';
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
function capture(input){
 const dir=fs.mkdtempSync(path.join(process.cwd(),'.overload-capture-'));
 const pkg='./'+path.basename(dir), name='TestOverloadCapture';
 try {
  for(const n of fs.readdirSync('executor/claudecode').filter(n=>n.endsWith('.go'))) fs.copyFileSync('executor/claudecode/'+n,path.join(dir,n));
  fs.copyFileSync('features/steps/overload_capture_test.go.txt',path.join(dir,'overload_capture_test.go'));
  const args=['test','-count=1','-v','-run','^'+name+'$',pkg];
  const r=spawnSync('go',args,{encoding:'utf8',timeout:180000,env:{...process.env,OVERLOAD_INPUT:JSON.stringify(input)}});
  const out=r.stdout+r.stderr, diagnostic=`${name}: go ${args.join(' ')} outcome ${r.status}: ${r.error||''}\n${out}`;
  assert.equal(r.status,0,diagnostic);
  assert.ok(out.includes('--- PASS: '+name+' ('),diagnostic+' absent, skipped or ran zero times');
  const rows=r.stdout.split('\n').filter(l=>l.startsWith('OVERLOAD_CAPTURE='));
  assert.equal(rows.length,1,diagnostic+' missing capture');
  return JSON.parse(rows[0].slice('OVERLOAD_CAPTURE='.length));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
function verify(row,spec){
 assert.equal(row.reason,spec.reason);
 assert.equal(row.class,spec.class);
 assert.equal(row.resume,'none');
 if(spec.reason){
  assert.equal(row.events.length,1);
  assert.equal(row.events[0].reason,spec.reason);
  assert.equal(row.events[0].detail,row.detail);
  assert.equal(row.next,'the executor session cannot continue after a failed round');
  if(spec.word){assert.ok(row.detail.includes(spec.word));assert.ok(Buffer.byteLength(row.detail)<=1024);}
 } else {assert.equal(row.ending,'finish');assert.equal(row.events.length,0);}
}
if(require.main!==module){
 const {When,Then}=require('@cucumber/cucumber');
 When('the overload adapter receives:',{timeout:240000},function(doc){this.overloadRow=capture(JSON.parse(doc));});
 Then('the overload outcome is:',function(doc){verify(this.overloadRow,JSON.parse(doc));});
} else {
 const row=capture({Error:true,Text:'generic api error'});
 const spec={class:'executor',reason:'provider_unavailable',word:'overloaded_error'};
 row.reason=spec.reason;row.detail='Provider: overloaded_error';row.events[0].reason=spec.reason;row.events[0].detail=row.detail;
 verify(row,spec);
 verify({class:'',reason:'',resume:'none',ending:'finish',events:[]},{class:'',reason:''});
 if(process.argv[2]==='good') console.log('observer accepted');
 else {
  const mutations=[r=>r.reason='failed',r=>r.class='candidate',r=>r.resume='exact',r=>r.events=[],r=>r.events[0].reason='failed',r=>r.events[0].detail='wrong',r=>r.next='allowed',r=>{r.detail='x';r.events[0].detail='x';},r=>{r.detail+='x'.repeat(1025);r.events[0].detail=r.detail;}];
  for(const mutate of mutations){const bad=structuredClone(row);mutate(bad);assert.throws(()=>verify(bad,spec));}
  assert.throws(()=>verify({class:'',reason:'',resume:'none',ending:'wrong',events:[]},{class:'',reason:''}));
  assert.throws(()=>verify({class:'',reason:'',resume:'none',ending:'finish',events:[{}]},{class:'',reason:''}));
  console.log('observer rejected');process.exitCode=1;
 }
}
