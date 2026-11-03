'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const source = String.raw`package main
import (
 "bytes"
 "context"
 "encoding/json"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
 "sync"
 "github.com/KogenAI/kogen-executor/executor"
 "github.com/KogenAI/kogen-executor/executor/claudecode"
)
func flag(a []string,k string) string { for i,s:=range a { if s==k && i+1<len(a) { return a[i+1] } };return "" }
func emit(v any) { b,e:=json.Marshal(v);must(e);fmt.Println(string(b)) }
func must(e error) { if e!=nil { panic(e) } }
func main() {
 a:=os.Args[1:]
 if len(a)>0 && a[0]=="hook" { os.Exit(claudecode.RunHook(a[1:],os.Stdin,os.Stdout,os.Stderr)) }
 if len(a)>0 && a[0]=="--version" { fmt.Println(claudecode.Version+" (Claude Code)");return }
 if len(a)>0 && a[0]=="auth" { fmt.Println("{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"apiProvider\":\"firstParty\"}");return }
 if len(a)>0 && a[0]=="-p" { fake(a);return }
 if len(a)!=1 { panic("expected fixture path") }
 tmp,e:=os.MkdirTemp("","result-round-");must(e);defer os.RemoveAll(tmp)
 root,home:=filepath.Join(tmp,"checkout"),filepath.Join(tmp,"home")
 must(os.MkdirAll(root,0700));must(os.MkdirAll(claudecode.RuntimeDir(home),0700))
 exe,e:=os.Executable();must(e);must(os.Symlink(exe,claudecode.RuntimePath(home)))
 var f struct { Role string };b,e:=os.ReadFile(a[0]);must(e);must(json.Unmarshal(b,&f))
 adapter:=claudecode.New(claudecode.Options{Home:home,HookCommand:[]string{exe,"hook"},Env:append(os.Environ(),"RESULT_FIXTURE="+a[0])})
 var mu sync.Mutex;var events []map[string]any
 s,e:=adapter.Start(context.Background(),executor.Task{Role:f.Role,Root:root,Home:home,Dir:filepath.Join(tmp,"artifacts"),Model:"claude-sonnet-5-5",Effort:"high",RunID:"result-size",MaxRounds:1,Schema:[]byte("{\"type\":\"object\"}"),Brief:executor.Brief{Stable:"synthetic tool result"}},func(v map[string]any){mu.Lock();defer mu.Unlock();events=append(events,v)})
 must(e);defer s.Close();_,e=s.Round(context.Background(),executor.Input{});must(e)
 mu.Lock();defer mu.Unlock();emit(events)
}
func fake(a []string) {
 var prompt bytes.Buffer;_,e:=prompt.ReadFrom(os.Stdin);must(e)
 var f struct { Role string;Name string;Mode string;Content any;Absent bool;Error bool }
 b,e:=os.ReadFile(os.Getenv("RESULT_FIXTURE"));must(e);must(json.Unmarshal(b,&f))
 sid:=flag(a,"--session-id");cwd,e:=os.Getwd();must(e);cwd,e=filepath.EvalSymlinks(cwd);must(e)
 emit(map[string]any{"type":"system","subtype":"init","cwd":cwd,"session_id":sid,"mcp_servers":[]any{},"model":"claude-sonnet-5-5","permissionMode":"acceptEdits","apiKeySource":"none","claude_code_version":"fixture"})
 input:=map[string]any{"file_path":"app.txt"}
 if f.Mode=="deny" { input["file_path"]=filepath.Join(filepath.Dir(cwd),"outside.txt") }
 emit(map[string]any{"type":"assistant","message":map[string]any{"content":[]any{map[string]any{"type":"tool_use","id":"t1","name":f.Name,"input":input}}}})
 if f.Mode=="deny" {
  var settings struct { Hooks map[string][]struct { Hooks []struct { Command string;Args []string } } }
  b,e:=os.ReadFile(flag(a,"--settings"));must(e);must(json.Unmarshal(b,&settings))
  h:=settings.Hooks["PreToolUse"][0].Hooks[0]
  in,e:=json.Marshal(map[string]any{"session_id":sid,"cwd":cwd,"hook_event_name":"PreToolUse","permission_mode":"acceptEdits","tool_name":f.Name,"tool_input":input,"tool_use_id":"t1"});must(e)
  cmd:=exec.Command(h.Command,h.Args...);cmd.Stdin=bytes.NewReader(in);out,e:=cmd.Output();must(e)
  if !strings.Contains(string(out),"\"permissionDecision\":\"deny\"") { panic("fixture hook must deny") }
 }
 c:=map[string]any{"type":"tool_result","tool_use_id":"t1","is_error":f.Error}
 if !f.Absent { c["content"]=f.Content }
 emit(map[string]any{"type":"user","message":map[string]any{"content":[]any{c}}})
 res:=map[string]any{"type":"result","subtype":"success","is_error":false,"num_turns":2,"session_id":sid,"result":"done","terminal_reason":"completed","permission_denials":[]any{}}
 if f.Role!=executor.RoleBuild { res["structured_output"]=map[string]any{"ok":true} }
 emit(res)
}
`;
let dir, bin;
function run(fixture) {
  if (!bin) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'result-size-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const src = path.join(dir, 'main.go'); bin = path.join(dir, 'driver');
    fs.writeFileSync(src, source);
    const r = cp.spawnSync('go', ['build', '-o', bin, src], {encoding:'utf8', timeout:180000});
    assert.equal(r.status, 0, `build result driver: ${r.error || ''}${r.stdout}${r.stderr}`);
  }
  const input = path.join(dir, 'fixture.json'); fs.writeFileSync(input, JSON.stringify(fixture));
  const r = cp.spawnSync(bin, [input], {encoding:'utf8',timeout:60000,maxBuffer:8<<20});
  assert.equal(r.status, 0, `adapter round: ${r.error || ''}${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout);
}
function verify(events, expected, forbidden) {
  const tools = events.filter(e => e.event === 'executor_tool');
  assert.equal(tools.length, 1, 'one completed tool call');
  const e = tools[0];
  for (const [key,value] of Object.entries(expected)) assert.deepEqual(e[key],value, key);
  const allowed = ['event','round','name','tool_use_id','denied','arguments','result_bytes','result_error','result_items'];
  if (expected.rejected_before_hook) allowed.push('rejected_before_hook');
  assert.deepEqual(Object.keys(e).sort(),allowed.sort(),'no result payload or added log fields');
  for (const s of forbidden) assert.ok(!JSON.stringify(events).includes(s), `result text leaked: ${s}`);
}
function controls(bad) {
  const events = run({role:'build',name:'Read',content:'secret-result-only',error:false});
  const tools=events.filter(e=>e.event==='executor_tool');
  assert.equal(tools.length,1,'fixture reached real adapter tool completion');
  const expected={event:'executor_tool',round:1,name:'Read',tool_use_id:'t1',denied:false,arguments:{file_path:'app.txt'},result_bytes:18,result_error:false,result_items:1};
  Object.assign(tools[0],expected);
  verify(events,expected,['secret-result-only']);
  if (!bad) { console.log('observer good'); return; }
  const mutations=[e=>{delete e.result_bytes;},e=>{e.result_bytes=0;},e=>{e.result_error=true;},e=>{e.result_items=0;},e=>{e.arguments={};},e=>{e.content='secret-result-only';},e=>{e.rejected_before_hook=true;}];
  for (const mutate of mutations) {
    const copy=structuredClone(events); mutate(copy.find(e=>e.event==='executor_tool'));
    assert.throws(()=>verify(copy,expected,['secret-result-only']));
  }
  const leak=structuredClone(events); leak.push({event:'other',text:'secret-result-only'});
  assert.throws(()=>verify(leak,expected,['secret-result-only']));
  assert.throws(()=>verify([...events,...tools],expected,[]));
  console.log('observer rejected all bad controls'); process.exitCode=1;
}
if (require.main === module) { controls(process.argv[2] === 'bad'); }
else {
  const {When,Then}=require('@cucumber/cucumber');
  When('k-exec-tool-result-size: a synthetic round completes:', {timeout:240000}, function(doc) {
    this.resultFixture=JSON.parse(doc);
    if (this.resultFixture.repeat) this.resultFixture.content=this.resultFixture.repeat.text.repeat(this.resultFixture.repeat.times);
    this.resultEvents=run(this.resultFixture);
  });
  Then('k-exec-tool-result-size: its tool event is:', function(doc) {
    const spec=JSON.parse(doc);
    verify(this.resultEvents,spec.event,spec.forbidden);
  });
}
