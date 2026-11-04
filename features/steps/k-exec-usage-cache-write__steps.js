'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const source = `package contract_test
import("encoding/json";"fmt";"os";"testing";"github.com/KogenAI/kogen-executor/executor")
func TestCacheWriteCapture(t *testing.T){
 var result map[string]any
 if e:=json.Unmarshal([]byte(os.Getenv("CACHE_WRITE_RESULT")),&result);e!=nil{t.Fatal(e)}
 result["session_id"]="@SID@"
 b,e:=json.Marshal(result);if e!=nil{t.Fatal(e)}
 r,e:=startFake(t,executor.RoleBuild,[][]string{{string(b)}});if e!=nil{t.Fatal(e)}
 rr,re:=r.session.Round(t.Context(),executor.Input{})
 name:="executor_round_ended";if re!=nil{name="executor_round_failed"}
 events:=r.events.named(name);if len(events)!=1{t.Fatalf("TestCacheWriteCapture: expected one %s, got %d",name,len(events))}
 out:=map[string]any{"event":name,"usage":events[0]["usage"]}
 if re==nil{out["round_usage"]=rr.Usage}
 b,e=json.Marshal(out);if e!=nil{t.Fatal(e)};fmt.Println("CACHE_WRITE="+string(b))
}
`;
function capture(result) {
 const dir=fs.mkdtempSync(path.join(process.cwd(),'.cache-write-'));
 const pkg='./'+path.basename(dir);
 const command=`go test -count=1 -v -run ^TestCacheWriteCapture$ ${pkg}`;
 try {
  for(const n of fs.readdirSync('contract').filter(n=>n.endsWith('.go'))) fs.copyFileSync(path.join('contract',n),path.join(dir,n));
  fs.writeFileSync(path.join(dir,'cache_write_capture_test.go'),source);
  const r=spawnSync('go',['test','-count=1','-v','-run','^TestCacheWriteCapture$',pkg],{encoding:'utf8',timeout:180000,env:{...process.env,CACHE_WRITE_RESULT:JSON.stringify(result)}});
  const text=(r.stdout||'')+(r.stderr||'');
  assert.equal(r.status,0,`TestCacheWriteCapture: ${command} exited ${r.status}: ${text}`);
  assert.match(text,/--- PASS: TestCacheWriteCapture \(/,`TestCacheWriteCapture absent, skipped or ran zero times: ${command} exited ${r.status}: ${text}`);
  const lines=text.split('\n').filter(l=>l.startsWith('CACHE_WRITE='));
  assert.equal(lines.length,1,`TestCacheWriteCapture: ${command} exited ${r.status}, missing capture: ${text}`);
  return JSON.parse(lines[0].slice(12));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
function project(u){ const out={};for(const k of ['input','cached','cache_write','output','reasoning','state'])out[k]=u[k];return out; }
function compare(actual,expected){
 assert.equal(actual.event,expected.event);
 assert.deepStrictEqual(project(actual.usage),expected.usage);
 if(actual.event==='executor_round_ended')assert.deepStrictEqual(project(actual.round_usage),expected.usage);
}
if(require.main===module){
 const expected={event:'executor_round_ended',usage:{input:1010,cached:700,cache_write:300,output:5,reasoning:null,state:'complete'}};
 const observed=capture({type:'result',subtype:'success',is_error:false,result:'done',num_turns:1,usage:{input_tokens:10,cache_read_input_tokens:700,cache_creation_input_tokens:300,output_tokens:5}});
 // Supply only the additive field on baseline output to qualify the observer independently of feature red.
 observed.usage.cache_write=300;observed.round_usage.cache_write=300;
 compare(observed,expected);
 if(process.argv[2]==='good'){console.log('accepted');}else{
  for(const area of ['usage','round_usage'])for(const k of Object.keys(expected.usage)){
   const bad=JSON.parse(JSON.stringify(observed));bad[area][k]=k==='state'?'unknown':-1;
   assert.throws(()=>compare(bad,expected));
  }
  const missing=JSON.parse(JSON.stringify(observed));delete missing.usage.cache_write;assert.throws(()=>compare(missing,expected));
  console.log('rejected');process.exitCode=1;
 }
}else{
 const {When,Then}=require('@cucumber/cucumber');
 When('k-exec-usage-cache-write: the adapter receives this result:',{timeout:240000},function(doc){this.cacheWrite=capture(JSON.parse(doc));});
 Then('k-exec-usage-cache-write: the terminal usage is:',function(doc){compare(this.cacheWrite,JSON.parse(doc));});
}
