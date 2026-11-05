'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const prefix='k-exec-protected-unicode-normalization: ';
// The driver is the production wiring of the hook subcommand: it hands its arguments and stdio to
// claudecode.RunHook. It is built with a go build -overlay, so nothing is written into the checkout.
const driverSource=`package main

import (
	"os"

	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

func main() { os.Exit(claudecode.RunHook(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)) }
`;
const driverPkg='kexecprotectedunicodehookdriver';
let scratch,hookBin;
function scratchDir(){
 if(!scratch){scratch=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'protected-unicode-')));process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));}
 return scratch;
}
function hookBinary(){
 if(hookBin)return hookBin;
 const d=fs.mkdtempSync(path.join(scratchDir(),'driver-'));
 const src=path.join(d,'main.go'),overlay=path.join(d,'overlay.json'),bin=path.join(d,'hook');
 fs.writeFileSync(src,driverSource);
 fs.writeFileSync(overlay,JSON.stringify({Replace:{[path.join(process.cwd(),driverPkg,'main.go')]:src}}));
 const args=['build','-overlay',overlay,'-o',bin,'./'+driverPkg];
 const r=cp.spawnSync('go',args,{cwd:process.cwd(),encoding:'utf8',timeout:200000});
 assert.equal(r.status,0,`go ${args.join(' ')} failed to build the hook driver: ${r.error||''}${r.stdout}${r.stderr}`);
 hookBin=bin;
 return bin;
}
// run writes a hook policy for a fresh checkout $T/<root> (Root is its real path, no protected_ids)
// and runs the real pretool hook once per call: a Write tool call with that file_path, cwd $T/<root>.
function run(spec){
 const bin=hookBinary();
 const t=fs.realpathSync(fs.mkdtempSync(path.join(scratchDir(),'t-')));
 const root=path.join(t,spec.root);
 fs.mkdirSync(root);
 const nonce=crypto.randomBytes(8).toString('hex');
 const log=path.join(t,'hook-log.jsonl'),pol=path.join(t,'hook-policy.json');
 fs.writeFileSync(pol,JSON.stringify({root,protected:spec.protected,log,nonce}),{mode:0o600});
 const answers=spec.calls.map((p,i)=>{
  const input=JSON.stringify({cwd:root,tool_name:'Write',tool_use_id:'w'+i,tool_input:{file_path:p.split('$T').join(t),content:'changed\n'}});
  const r=cp.spawnSync(bin,['pretool','--policy',pol],{input,encoding:'utf8',timeout:60000});
  return {path:p,exit:r.status,stdout:r.stdout,stderr:r.stderr+(r.error?String(r.error):'')};
 });
 const records=fs.existsSync(log)?fs.readFileSync(log,'utf8').split('\n').filter(l=>l!=='').map(l=>JSON.parse(l)):[];
 return {t,nonce,answers,records};
}
function answers(a,want){
 const got=a.answers.map(w=>{
  assert.equal(w.exit,0,`pretool exit for ${JSON.stringify(w.path)}: ${w.stderr}`);
  assert.equal(w.stderr,'',`pretool stderr for ${JSON.stringify(w.path)}`);
  if(w.stdout==='')return {path:w.path,decision:'allow',reason:''};
  let o;
  try{o=JSON.parse(w.stdout).hookSpecificOutput;}catch(e){assert.fail(`pretool stdout for ${JSON.stringify(w.path)} is not the deny JSON: ${JSON.stringify(w.stdout)}`);}
  assert.equal(o.hookEventName,'PreToolUse',`pretool hookEventName for ${JSON.stringify(w.path)}`);
  return {path:w.path,decision:o.permissionDecision,reason:o.permissionDecisionReason};
 });
 assert.deepEqual(got,want,'pretool answers, in call order');
}
function records(a,want){
 const got=a.records.map(r=>{
  assert.equal(r.nonce,a.nonce,`hook log record ${r.tool_use_id} carries the run nonce`);
  assert.ok(typeof r.time==='string'&&r.time!=='',`hook log record ${r.tool_use_id} has a time`);
  const c={...r};delete c.nonce;delete c.time;
  if(typeof c.path==='string')c.path=c.path.split(a.t).join('$T');
  return c;
 });
 assert.deepEqual(got,want,'hook log records, in call order, exactly these keys besides nonce and time');
}
function controls(bad){
 const spec={root:'r',protected:['notes.txt'],calls:['notes.txt','näive.txt']};
 const answersWant=[{path:'notes.txt',decision:'deny',reason:'Kogen: this is a protected path (notes.txt)'},{path:'näive.txt',decision:'allow',reason:''}];
 const logWant=[{hook:'pretool',tool_use_id:'w0',tool_name:'Write',path:'$T/r/notes.txt',decision:'deny',reason:'this is a protected path (notes.txt)'},{hook:'pretool',tool_use_id:'w1',tool_name:'Write',path:'$T/r/näive.txt',decision:'allow'}];
 const check=a=>{answers(a,answersWant);records(a,logWant);};
 const good=run(spec);
 check(good);
 if(!bad){console.log('observer good');return;}
 const mutations=[
  a=>a.answers[0].stdout='',
  a=>a.answers[1].stdout=a.answers[0].stdout,
  a=>a.answers[0].stdout=a.answers[0].stdout.replace('(notes.txt)','(NOTES.txt)'),
  a=>a.answers[0].stdout='not json\n',
  a=>a.answers[0].exit=2,
  a=>a.answers[1].stderr='kogen executor hook: invalid policy\n',
  a=>a.answers.pop(),
  a=>a.records[0].decision='allow',
  a=>a.records[0].nonce='stale',
  a=>a.records[0].time='',
  a=>a.records[0].reason='Kogen: this is a protected path (notes.txt)',
  a=>a.records[1].reason='',
  a=>a.records[1].path=a.records[1].path.normalize('NFC'),
  a=>a.records[1].tool_use_id='w0',
  a=>a.records.pop(),
  a=>a.records.push({...a.records[1]}),
 ];
 for(const m of mutations){const a=structuredClone(good);m(a);assert.throws(()=>check(a),undefined,`mutation ${m} was accepted`);}
 console.log('observer bad rejected');
 process.exitCode=1;
}
if(require.main===module){
 if(process.argv[2]==='capture'){const a=run(JSON.parse(process.argv[3]));console.log(JSON.stringify(a.answers.map(w=>[w.path,w.exit,w.stdout,w.stderr]))+'\n'+JSON.stringify(a.records.map(r=>({...r,path:r.path&&r.path.split(a.t).join('$T')}))));}
 else controls(process.argv[2]==='bad');
}else{
 const{When,Then}=require('@cucumber/cucumber');
 When(prefix+'the pretool hook runs these Write calls in a temporary checkout:',{timeout:240000},function(doc){this.pun=run(JSON.parse(doc));});
 Then(prefix+'the hook answers:',function(doc){answers(this.pun,JSON.parse(doc));});
 Then(prefix+'the hook log holds, each with the run nonce and a time:',function(doc){records(this.pun,JSON.parse(doc));});
}
