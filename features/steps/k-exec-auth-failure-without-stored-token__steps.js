'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const source=`package claudecode
import("context";"encoding/json";"fmt";"os";"testing";"github.com/KogenAI/kogen-executor/executor";"github.com/KogenAI/kogen-loop/sys")
func TestAuthRouteCapture(t *testing.T) {
 var in struct { Token bool; Assistant string; Text string; IsError bool; Terminal string; NoResult bool }
 if err:=json.Unmarshal([]byte(os.Getenv("AUTH_ROUTE_INPUT")),&in);err!=nil {t.Fatal(err)}
 cfg:=fakeConfig{Script:oneRound(finishRound),AssistantError:in.Assistant,NoResult:in.NoResult,Result:map[string]any{"is_error":in.IsError,"result":in.Text,"terminal_reason":in.Terminal,"num_turns":1,"total_cost_usd":0.5,"usage":errorUsage}}
 if in.Token {cfg.Auth=\x60{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}\x60}
 h:=newHarness(t,cfg); opts:=h.f.options(); if in.Token {opts.Token="sk-ant-oat01-SYNTHETIC-BAD"}
 s,err:=h.start(opts);if err!=nil {t.Fatal(err)};defer s.Close()
 _,err=s.Round(context.Background(),executor.Input{})
 out:=map[string]any{"reason":"success","detail":"","events":h.eventsNamed("executor_round_failed")}
 if err!=nil {e,ok:=sys.AsError(err);if !ok {t.Fatal(err)};out["reason"]=e.Class+"/"+e.Reason;out["detail"]=e.Detail}
 b,err:=json.Marshal(out);if err!=nil {t.Fatal(err)};fmt.Println("AUTH_ROUTE="+string(b))
}
`;
function capture(input){
 const file=`executor/claudecode/auth_route_capture_${process.pid}_test.go`;
 assert.ok(!fs.existsSync(file));
 try{
  fs.writeFileSync(file,source);
  const r=spawnSync('go',['test','-count=1','-v','-run','^TestAuthRouteCapture$','./executor/claudecode'],{encoding:'utf8',timeout:180000,env:{...process.env,AUTH_ROUTE_INPUT:JSON.stringify(input)}});
  const text=(r.stdout||'')+(r.stderr||'');
  assert.equal(r.status,0,`TestAuthRouteCapture: go test ./executor/claudecode outcome ${r.status}: ${text}`);
  const lines=text.split('\n').filter(x=>x.startsWith('AUTH_ROUTE='));
  assert.equal(lines.length,1,`TestAuthRouteCapture absent, skipped or ran zero times: go test ./executor/claudecode outcome ${r.status}: ${text}`);
  return JSON.parse(lines[0].slice(11));
 }finally{fs.rmSync(file,{force:true});}
}
function observe(actual,expected){
 assert.equal(actual.reason,expected.reason);
 const events=actual.events||[];
 assert.equal(events.length,expected.reason==='success'?0:1);
 if(events.length)assert.equal(events[0].reason,expected.reason.split('/')[1]);
 if(expected.hint!=='none'){
  assert.ok(actual.detail.includes('kogen provider login claude-code'));
  for(const forbidden of ['401','OAuth access token is invalid','sk-ant-','person@example.invalid','Secret Org'])assert.ok(!actual.detail.includes(forbidden));
  if(expected.hint==='token')assert.equal(actual.detail,'Claude Code did not accept the stored token; run `claude setup-token` and `kogen provider login claude-code`');
  else{assert.ok(!actual.detail.includes('stored token'));assert.match(actual.detail,/sign in|login|log in/i);}
  const ev=events[0];
  assert.equal(ev.num_turns,1);assert.equal(ev.subtype,'success');assert.equal(ev.terminal_reason,'api_error');
  assert.deepEqual(ev.usage,{cached:20,cost_usd:0.5,input:35,model:'claude-sonnet-5-5',output:7,reasoning:null,source:'harness',state:'complete'});
 }
}
if(require.main===module){
 const expected={reason:'executor/auth_refused',hint:'login'};
 const good={reason:'executor/auth_refused',detail:'Sign in again with `kogen provider login claude-code`',events:[{reason:'auth_refused',num_turns:1,subtype:'success',terminal_reason:'api_error',usage:{cached:20,cost_usd:0.5,input:35,model:'claude-sonnet-5-5',output:7,reasoning:null,source:'harness',state:'complete'}}]};
 observe(good,expected);
 if(process.argv[2]==='good')console.log('accepted');
 else{
  const mutations=[x=>x.reason='executor/failed',x=>x.events=[],x=>x.events[0].reason='failed',x=>x.detail='raw 401',x=>x.detail+=' stored token',x=>x.detail+=' sk-ant-secret',x=>x.detail+=' person@example.invalid',x=>x.events[0].num_turns=2,x=>x.events[0].subtype='error',x=>x.events[0].terminal_reason='other',x=>x.events[0].usage.input=0,x=>x.events[0].usage.cost_usd=0];
  for(const mutate of mutations){const bad=JSON.parse(JSON.stringify(good));mutate(bad);assert.throws(()=>observe(bad,expected));}
  observe({...good,detail:'Claude Code did not accept the stored token; run `claude setup-token` and `kogen provider login claude-code`'},{...expected,hint:'token'});
  assert.throws(()=>observe(good,{...expected,hint:'token'}));
  observe({reason:'success',detail:'',events:[]},{reason:'success',hint:'none'});
  assert.throws(()=>observe(good,{reason:'success',hint:'none'}));
  console.log('rejected');process.exitCode=1;
 }
}else{
 const {When,Then}=require('@cucumber/cucumber');
 When('k-exec-auth-failure-without-stored-token: run the round:',{timeout:240000},function(doc){this.authRoute=capture(JSON.parse(doc));});
 Then('k-exec-auth-failure-without-stored-token: the outcome is:',function(doc){observe(this.authRoute,JSON.parse(doc));});
}
