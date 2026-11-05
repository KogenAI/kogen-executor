'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const P='fix-k-exec-unanswered-guarded-call-at-result: ';
const source=String.raw`package main
import("bytes";"context";"encoding/json";"fmt";"os";"os/exec";"path/filepath";"sync";"time";"github.com/KogenAI/kogen-executor/executor";"github.com/KogenAI/kogen-executor/executor/claudecode")
type Call struct{ID string;Decision string;Changed bool}
type Fixture struct{Calls []Call;Iterations int}
func must(e error){if e!=nil{panic(e)}}
func emit(v any){b,e:=json.Marshal(v);must(e);fmt.Println(string(b))}
func flag(a []string,k string)string{for i,s:=range a{if s==k&&i+1<len(a){return a[i+1]}};return ""}
func load(p string)Fixture{var f Fixture;b,e:=os.ReadFile(p);must(e);must(json.Unmarshal(b,&f));return f}
func main(){a:=os.Args[1:]
if len(a)>0&&a[0]=="hook"{os.Exit(claudecode.RunHook(a[1:],os.Stdin,os.Stdout,os.Stderr))}
if len(a)>0&&a[0]=="--version"{fmt.Println(claudecode.Version+" (Claude Code)");return}
if len(a)>0&&a[0]=="auth"{fmt.Println("{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"apiProvider\":\"firstParty\"}");return}
if len(a)>0&&a[0]=="-p"{fake(a);return}
f:=load(a[0]);exe,e:=os.Executable();must(e);runs:=[]any{}
for i:=0;i<f.Iterations;i++{runs=append(runs,round(a[0],exe))}
emit(map[string]any{"runs":runs})}
func round(fixture,exe string)map[string]any{tmp,e:=os.MkdirTemp("","unanswered-order-");must(e);defer os.RemoveAll(tmp);root,home:=filepath.Join(tmp,"checkout"),filepath.Join(tmp,"home");must(os.MkdirAll(root,0700));must(os.MkdirAll(claudecode.RuntimeDir(home),0700));must(os.Symlink(exe,claudecode.RuntimePath(home)))
var mu sync.Mutex;events:=[]map[string]any{};adapter:=claudecode.New(claudecode.Options{Home:home,HookCommand:[]string{exe,"hook"},Env:append(os.Environ(),"UNANSWERED_ORDER_FIXTURE="+fixture)})
s,e:=adapter.Start(context.Background(),executor.Task{Role:executor.RoleBuild,Root:root,Home:home,Dir:filepath.Join(tmp,"artifacts"),Model:"claude-sonnet-5-5",Effort:"high",RunID:"unanswered-order",MaxRounds:1,Schema:[]byte("{\"type\":\"object\"}"),Brief:executor.Brief{Stable:"synthetic unanswered order"}},func(v map[string]any){mu.Lock();defer mu.Unlock();events=append(events,v)});must(e);defer s.Close()
out,err:=s.Round(context.Background(),executor.Input{});text:="";if err!=nil{text=err.Error()};mu.Lock();defer mu.Unlock();return map[string]any{"error":text,"ending":out.Ending,"events":events}}
func fake(a []string){var p bytes.Buffer;_,e:=p.ReadFrom(os.Stdin);must(e);f:=load(os.Getenv("UNANSWERED_ORDER_FIXTURE"));sid:=flag(a,"--session-id");cwd,e:=os.Getwd();must(e);cwd,e=filepath.EvalSymlinks(cwd);must(e)
emit(map[string]any{"type":"system","subtype":"init","cwd":cwd,"session_id":sid,"mcp_servers":[]any{},"model":"claude-sonnet-5-5","permissionMode":"acceptEdits","apiKeySource":"none"})
uses:=[]any{};for _,c:=range f.Calls{uses=append(uses,map[string]any{"type":"tool_use","id":c.ID,"name":"Write","input":map[string]any{"file_path":filepath.Join(cwd,c.ID+".txt")}})}
emit(map[string]any{"type":"assistant","message":map[string]any{"content":uses}})
// Allow the adapter to consume the tool_use snapshots before mutating the targets.
time.Sleep(200*time.Millisecond)
var settings struct{Hooks map[string][]struct{Hooks []struct{Command string;Args []string}}};b,e:=os.ReadFile(flag(a,"--settings"));must(e);must(json.Unmarshal(b,&settings));h:=settings.Hooks["PreToolUse"][0].Hooks[0]
for _,c:=range f.Calls{target:=filepath.Join(cwd,c.ID+".txt")
if c.Decision=="allow"{in,e:=json.Marshal(map[string]any{"session_id":sid,"cwd":cwd,"hook_event_name":"PreToolUse","permission_mode":"acceptEdits","tool_name":"Write","tool_input":map[string]any{"file_path":target},"tool_use_id":c.ID});must(e);cmd:=exec.Command(h.Command,h.Args...);cmd.Stdin=bytes.NewReader(in);out,e:=cmd.Output();must(e);if len(bytes.TrimSpace(out))!=0{panic("allow hook should be silent: "+string(out))}}
if c.Changed{must(os.WriteFile(target,[]byte("created by fake"),0600))}}
emit(map[string]any{"type":"result","subtype":"success","is_error":false,"session_id":sid,"result":"done","terminal_reason":"completed","num_turns":1,"permission_denials":[]any{}})}
`;
let dir,bin;
function run(f){if(!bin){dir=fs.mkdtempSync(path.join(os.tmpdir(),'unanswered-order-driver-'));process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));const src=path.join(dir,'main.go');bin=path.join(dir,'driver');fs.writeFileSync(src,source);const r=cp.spawnSync('go',['build','-o',bin,src],{encoding:'utf8',timeout:180000});assert.equal(r.status,0,`build synthetic driver: ${r.error||''}${r.stdout}${r.stderr}`);}const input=path.join(dir,'fixture.json');fs.writeFileSync(input,JSON.stringify(f));const r=cp.spawnSync(bin,[input],{encoding:'utf8',timeout:120000});assert.equal(r.status,0,`run synthetic driver: ${r.error||''}${r.stdout}${r.stderr}`);return JSON.parse(r.stdout);}
function summary(e){if(e.event==='executor_hook')return `hook ${e.tool_use_id} ${e.decision}`;return `tool ${e.tool_use_id}${e.unanswered===true?' unanswered':''}${e.denied===true?' denied':''}`;}
function verify(result,expected){assert.equal(result.runs.length,expected.iterations,'every iteration ran');result.runs.forEach((run,i)=>{const at=`iteration ${i+1} of ${expected.iterations}`;if(expected.error){assert.ok(run.error.includes(expected.error),`${at}: error ${JSON.stringify(run.error)} does not contain ${JSON.stringify(expected.error)}`);assert.match(run.error,/executor\/protocol/,`${at}: protocol error`);}else assert.equal(run.error,'',`${at}: round succeeds`);const got=run.events.filter(e=>e.event==='executor_hook'||e.event==='executor_tool').map(summary);assert.deepEqual(got,expected.events,`${at}: hook and tool events in order`);});}
function controls(bad){const ok=run({Calls:[{ID:'call-a',Decision:'allow',Changed:true}],Iterations:2});const okExpected={iterations:2,events:['hook call-a allow','tool call-a unanswered']};verify(ok,okExpected);const fail=run({Calls:[{ID:'call-a',Decision:'none',Changed:true}],Iterations:2});const failExpected={iterations:2,error:'hook did not run for the Write call "call-a"',events:[]};verify(fail,failExpected);
if(bad){const muts=[[ok,okExpected,x=>x.runs.pop()],[ok,okExpected,x=>x.runs[1].error='oops'],[ok,okExpected,x=>x.runs[1].events.reverse()],[ok,okExpected,x=>x.runs[0].events=x.runs[0].events.filter(e=>e.event!=='executor_hook')],[ok,okExpected,x=>x.runs[1].events.push(x.runs[1].events.find(e=>e.event==='executor_tool'))],[ok,okExpected,x=>{for(const e of x.runs[0].events)if(e.event==='executor_tool')delete e.unanswered;}],[fail,failExpected,x=>x.runs[1].error=''],[fail,failExpected,x=>x.runs[0].error=x.runs[0].error.replace('call-a','call-b')],[fail,failExpected,x=>x.runs[1].events.push({event:'executor_tool',tool_use_id:'call-a',unanswered:true})],[fail,failExpected,x=>x.runs[0].events.push({event:'executor_hook',tool_use_id:'call-a',decision:'allow'})]];for(const [base,expected,mutate] of muts){const x=structuredClone(base);mutate(x);assert.throws(()=>verify(x,expected));}console.log('observer rejected bad controls');process.exitCode=1;}else console.log('observer good');}
if(require.main===module)controls(process.argv[2]==='bad');else{const {When,Then}=require('@cucumber/cucumber');When(P+'a fake round runs:',{timeout:300000},function(doc){this.unansweredOrderResult=run(JSON.parse(doc));});Then(P+'every iteration ends with:',function(doc){verify(this.unansweredOrderResult,JSON.parse(doc));});}
