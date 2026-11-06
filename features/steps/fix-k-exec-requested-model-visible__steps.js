'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const prefix='fix-k-exec-requested-model-visible: ';
const pkg='./executor/claudecode';
// The capture test exists only in a go test -overlay: it runs one real round through the fake
// Claude Code with the given init "model" value (JSON null removes the key) and prints the
// terminal event.
const capture=String.raw`package claudecode
import("context";"encoding/json";"fmt";"os";"testing";"github.com/KogenAI/kogen-executor/executor")
func TestFixModelSeenCapture(t *testing.T){
 var c struct{Mode string;Requested string;Init json.RawMessage}
 if err:=json.Unmarshal([]byte(os.Getenv("FIX_MODEL_CASE")),&c);err!=nil{t.Fatal(err)}
 var model any
 if err:=json.Unmarshal(c.Init,&model);err!=nil{t.Fatal(err)}
 cfg:=fakeConfig{Script:oneRound(finishRound),Init:map[string]any{"model":model}}
 if c.Mode=="error"{cfg.Result=map[string]any{"is_error":true,"subtype":"error_during_execution"}}
 h:=newHarness(t,cfg);h.task.Model=c.Requested
 s:=h.startOK();defer s.Close()
 result,err:=s.Round(context.Background(),executor.Input{})
 name:="executor_round_ended";if err!=nil{name="executor_round_failed"}
 events:=h.eventsNamed(name);if len(events)!=1{t.Fatalf("terminal events: %v",h.events)}
 b,e:=json.Marshal(map[string]any{"event":events[0],"ending":result.Ending,"failed":err!=nil});if e!=nil{t.Fatal(e)}
 fmt.Printf("FIX_MODEL_RECEIPT=%s\n",b)
}
`;
const addModelsHead='func (r *roundRun) addModels(event map[string]any) {';
const mutations={
 // requested_model and model swapped: the broken behaviour TestRoundModelProjection must catch.
 swap:addModelsHead+'\n\tevent["requested_model"] = bound(r.s.a.redact(r.model), 256)\n\tif r.modelSeen {\n\t\tevent["model"] = bound(r.s.a.redact(r.s.task.Model), 256)\n\t}\n}\n',
 // both fields unbounded and unredacted: only used by the observer controls as a real failing run.
 unbounded:addModelsHead+'\n\tevent["requested_model"] = r.s.task.Model\n\tif r.modelSeen {\n\t\tevent["model"] = r.model\n\t}\n}\n',
};
function goTest(args,env,overlay){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fix-model-seen-'));
 try{
  const replace={};
  for(const [target,body] of Object.entries(overlay)){const f=path.join(dir,String(Object.keys(replace).length)+'.go');fs.writeFileSync(f,body);replace[path.resolve(target)]=f;}
  const o=path.join(dir,'overlay.json');fs.writeFileSync(o,JSON.stringify({Replace:replace}));
  const full=['test','-overlay',o,pkg,...args,'-count=1','-v'];
  const p=spawnSync('go',full,{encoding:'utf8',env:{...process.env,...env},timeout:240000});
  return {status:p.status,output:(p.error?String(p.error)+'\n':'')+(p.stdout||'')+(p.stderr||''),command:'go '+full.filter(a=>a!==o).join(' ').replace('-overlay ','-overlay <'+(Object.keys(overlay).length?'mutation':'none')+'> ')};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function round(mode,requested,initJSON){
 JSON.parse(initJSON);
 const r=goTest(['-run','^TestFixModelSeenCapture$'],{FIX_MODEL_CASE:JSON.stringify({Mode:mode,Requested:requested,Init:JSON.parse(initJSON)})},{'executor/claudecode/kogen_fix_model_seen_capture_test.go':capture});
 assert.equal(r.status,0,`TestFixModelSeenCapture: ${r.command} exited ${r.status}:\n${r.output}`);
 const lines=r.output.split('\n').filter(l=>l.startsWith('FIX_MODEL_RECEIPT='));
 assert.equal(lines.length,1,`TestFixModelSeenCapture: ${r.command} printed ${lines.length} receipts (the test did not run or ran more than once):\n${r.output}`);
 return {mode,requested,receipt:JSON.parse(lines[0].slice('FIX_MODEL_RECEIPT='.length))};
}
function checkRound(run,requested){
 const {mode,receipt}=run,e=receipt.event;
 assert.equal(receipt.failed,mode!=='ok',`round failed: ${JSON.stringify(receipt)}`);
 assert.equal(e.event,mode==='ok'?'executor_round_ended':'executor_round_failed','terminal event name');
 if(mode==='ok'){assert.equal(receipt.ending,'finish');assert.equal(e.ending,'finish');}
 else assert.equal(e.reason,'failed','failed round reason');
 assert.equal(e.requested_model,requested,'requested_model');
}
function checkReports(run,requested,model){
 checkRound(run,requested);
 assert.ok(Object.hasOwn(run.receipt.event,'model'),`model missing from ${JSON.stringify(run.receipt.event)}`);
 assert.equal(run.receipt.event.model,model,'model');
}
function checkOmits(run,requested){
 checkRound(run,requested);
 assert.equal(Object.hasOwn(run.receipt.event,'model'),false,`the terminal event carries "model":${JSON.stringify(run.receipt.event.model)} instead of omitting it: ${JSON.stringify(run.receipt.event)}`);
}
function addModelsFile(){
 const dir='executor/claudecode';
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.go')&&!f.endsWith('_test.go')).filter(f=>fs.readFileSync(path.join(dir,f),'utf8').includes(addModelsHead));
 assert.equal(files.length,1,`expected exactly one non-test file in ${dir} defining "${addModelsHead}", found ${JSON.stringify(files)}`);
 return path.join(dir,files[0]);
}
function projection(mutation){
 const overlay={};
 if(mutation){
  const file=addModelsFile(),src=fs.readFileSync(file,'utf8'),start=src.indexOf(addModelsHead),end=src.indexOf('\n}\n',start);
  assert.ok(end>start,`cannot find the end of addModels in ${file}`);
  overlay[file]=src.slice(0,start)+mutations[mutation]+src.slice(end+3);
 }
 return {mutation:mutation||'none',...goTest(['-run','^TestRoundModelProjection$'],{},overlay)};
}
function describe(r){return `TestRoundModelProjection with addModels mutation ${r.mutation}: ${r.command} exited ${r.status}:\n${r.output}`;}
function checkPasses(r){
 assert.equal(r.status,0,'TestRoundModelProjection did not pass. '+describe(r));
 assert.match(r.output,/^--- PASS: TestRoundModelProjection \(/m,'TestRoundModelProjection did not run and pass. '+describe(r));
}
function checkFails(r){
 assert.doesNotMatch(r.output,/\[(build|setup) failed\]/,'the package did not build, so TestRoundModelProjection never ran. '+describe(r));
 assert.notEqual(r.status,0,'TestRoundModelProjection stayed green on the broken behaviour. '+describe(r));
 assert.match(r.output,/^--- FAIL: TestRoundModelProjection \(/m,'TestRoundModelProjection did not run and fail. '+describe(r));
}
function controls(bad){
 const good=round('ok','alias-a','"full-id-a"');
 checkReports(good,'alias-a','full-id-a');
 const omitted=structuredClone(good);delete omitted.receipt.event.model;
 checkOmits(omitted,'alias-a');
 const pass=projection(null),fail=projection('unbounded');
 checkPasses(pass);checkFails(fail);
 if(!bad){console.log('observer good');return;}
 const empty=structuredClone(good);empty.receipt.event.model='';
 assert.throws(()=>checkOmits(empty,'alias-a'));
 assert.throws(()=>checkOmits(good,'alias-a'));
 assert.throws(()=>checkReports(omitted,'alias-a','full-id-a'));
 assert.throws(()=>checkReports(good,'full-id-a','full-id-a'));
 const swapped=structuredClone(good);swapped.receipt.event.requested_model='full-id-a';swapped.receipt.event.model='alias-a';
 assert.throws(()=>checkReports(swapped,'alias-a','full-id-a'));
 const failed=structuredClone(good);failed.receipt.failed=true;
 assert.throws(()=>checkReports(failed,'alias-a','full-id-a'));
 assert.throws(()=>checkFails(pass));
 assert.throws(()=>checkPasses(fail));
 const none={mutation:'none',status:0,command:'go test',output:'testing: warning: no tests to run\nPASS\nok  \tgithub.com/KogenAI/kogen-executor/executor/claudecode\t0.01s [no tests to run]\n'};
 assert.throws(()=>checkPasses(none));assert.throws(()=>checkFails(none));
 const broken={mutation:'swap',status:1,command:'go test',output:'FAIL\tgithub.com/KogenAI/kogen-executor/executor/claudecode [build failed]\n--- FAIL: TestRoundModelProjection (0.00s)\n'};
 assert.throws(()=>checkFails(broken));
 console.log('observer bad rejected');process.exitCode=1;
}
if(require.main===module)controls(process.argv[2]==='bad');
else{
 const {When,Then}=require('@cucumber/cucumber');
 When(new RegExp('^'+prefix+'a "(ok|error)" round requesting "([^"]*)" receives init model JSON (.+)$'),{timeout:300000},function(mode,requested,init){this.fixModelRound=round(mode,requested,init);});
 Then(prefix+'the terminal event reports requested model {string} and model {string}',function(requested,model){checkReports(this.fixModelRound,requested,model);});
 Then(prefix+'the terminal event reports requested model {string} and omits model',function(requested){checkOmits(this.fixModelRound,requested);});
 When(prefix+'TestRoundModelProjection runs on the tree as built',{timeout:300000},function(){this.fixModelProjection=projection(null);});
 When(prefix+'TestRoundModelProjection runs with addModels swapping requested_model and model',{timeout:300000},function(){this.fixModelProjection=projection('swap');});
 Then(prefix+'TestRoundModelProjection passes',function(){checkPasses(this.fixModelProjection);});
 Then(prefix+'TestRoundModelProjection fails',function(){checkFails(this.fixModelProjection);});
}
