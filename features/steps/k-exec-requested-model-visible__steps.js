const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const source = `package claudecode
import("context";"encoding/json";"fmt";"os";"testing";"github.com/KogenAI/kogen-executor/executor")
func TestRequestedModelReceipt(t *testing.T) {
 var c struct{Requested string; Observed string; Mode string}; if err:=json.Unmarshal([]byte(os.Getenv("MODEL_CASE")), &c);err!=nil{t.Fatal(err)}
 cfg:=fakeConfig{Script:oneRound(finishRound),Init:map[string]any{"model":c.Observed}}
 if c.Mode=="error" {cfg.Result=map[string]any{"is_error":true,"subtype":"error_during_execution"}}
 if c.Mode=="early" {cfg.ExitBeforeStdin=true;cfg.ExitCode=1}
 h:=newHarness(t,cfg); h.task.Model=c.Requested
 opts:=h.f.options();opts.Token="SYNTHETIC-model-secret"
 s,err:=h.start(opts);if err!=nil{t.Fatal(err)};defer s.Close()
 result,err:=s.Round(context.Background(),executor.Input{})
 name:="executor_round_ended"; if err!=nil{name="executor_round_failed"}
 events:=h.eventsNamed(name); if len(events)!=1{t.Fatalf("terminal events: %v",h.events)}
 receipt:=map[string]any{"event":events[0],"argv":h.f.argv(1),"ending":result.Ending,"failed":err!=nil}
 b,e:=json.Marshal(receipt);if e!=nil{t.Fatal(e)};fmt.Printf("MODEL_RECEIPT=%s\\n",b)
}
`;
function run(c) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'model-receipt-'));
 try {
  const go=path.join(dir,'receipt_test.go');fs.writeFileSync(go,source);
  const target=path.resolve('executor/claudecode/kogen_model_receipt_test.go');
  const overlay=path.join(dir,'overlay.json');fs.writeFileSync(overlay,JSON.stringify({Replace:{[target]:go}}));
  const p=spawnSync('go',['test','-overlay',overlay,'./executor/claudecode','-run','^TestRequestedModelReceipt$','-count=1','-v'],{encoding:'utf8',env:{...process.env,MODEL_CASE:JSON.stringify(c)},timeout:120000});
  const output=(p.stdout||'')+(p.stderr||'');
  assert.equal(p.status,0,'TestRequestedModelReceipt: go test ./executor/claudecode failed: '+output);
  const lines=output.split('\n').filter(l=>l.startsWith('MODEL_RECEIPT='));
  assert.equal(lines.length,1,'TestRequestedModelReceipt: missing receipt from go test ./executor/claudecode: '+output);
  return JSON.parse(lines[0].slice(14));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
function check(r,c,limit) {
 const e=r.event;
 function text(actual,raw) {
  assert.equal(typeof actual,'string');
  if(raw.includes('SYNTHETIC-model-secret')) {
   assert.ok(!actual.includes('SYNTHETIC-model-secret'),'model telemetry leaks credential');
   assert.ok(actual.includes('prefix-')&&actual.includes('-suffix'),'retain nonsecret model text');
  } else assert.equal(actual,raw.length>limit?raw.slice(0,limit)+'...':raw);
 }
 text(e.requested_model,c.Requested);
 if(c.Mode==='early') assert.equal(Object.hasOwn(e,'model'),false);
 else text(e.model,c.Observed);
 assert.equal(r.failed,c.Mode!=='ok');
 assert.equal(e.event,c.Mode==='ok'?'executor_round_ended':'executor_round_failed');
 const i=r.argv.indexOf('--model');
 if(c.Requested==='')assert.equal(i,-1);else {assert.ok(i>=0);assert.equal(r.argv[i+1],c.Requested);}
 if(c.Mode==='ok') {
  assert.equal(r.ending,'finish');assert.equal(e.ending,'finish');
  assert.equal(e.usage.input,120);assert.equal(e.usage.cached,20);assert.equal(e.usage.output,30);
 } else assert.equal(e.reason,'failed');
}
if(require.main!==module) {
 const {When,Then}=require('@cucumber/cucumber');
 When('k-exec-requested-model-visible: I run a {string} round requesting {string} observing {string}',function(mode,requested,observed){
  this.modelCase={Mode:mode,Requested:requested==='LONG'?'r'.repeat(5000):requested,Observed:observed==='LONG'?'m'.repeat(5000):observed};
  this.modelReceipt=run(this.modelCase);
 });
 Then('k-exec-requested-model-visible: the telemetry preserves the round with a {int} byte text limit',function(limit){check(this.modelReceipt,this.modelCase,limit);});
} else {
 try {
  const c={Mode:'ok',Requested:'alias-a',Observed:'full-id-a'};
  const r=run(c);
  // Supply only missing feature fields; outcomes, usage and argv are real fake output.
  r.event.requested_model=c.Requested;r.event.model=c.Observed;
  if(process.argv[2]==='bad')r.event.usage.input=140;
  check(r,c,256);
  console.log('observer accepted');
 } catch(e) {console.log('observer rejected');process.exitCode=1;}
}
