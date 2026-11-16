'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const P='exec-hook-deny-events-name-reason: ';
const TOOL_TEXT='PreToolUse:Write hook error: denied';
const source=String.raw`package main
import("bytes";"context";"encoding/json";"fmt";"os";"os/exec";"path/filepath";"strings";"sync";"time";"github.com/KogenAI/kogen-executor/executor";"github.com/KogenAI/kogen-executor/executor/claudecode")
type Call struct{ID string;Path string;HookPath string;Answer bool}
type Fixture struct{Calls []Call}
func must(e error){if e!=nil{panic(e)}}
func emit(v any){b,e:=json.Marshal(v);must(e);fmt.Println(string(b))}
func flag(a []string,k string)string{for i,s:=range a{if s==k&&i+1<len(a){return a[i+1]}};return ""}
func main(){a:=os.Args[1:]
if len(a)>0&&a[0]=="hook"{os.Exit(claudecode.RunHook(a[1:],os.Stdin,os.Stdout,os.Stderr))}
if len(a)>0&&a[0]=="--version"{fmt.Println(claudecode.Version+" (Claude Code)");return}
if len(a)>0&&a[0]=="auth"{fmt.Println("{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"apiProvider\":\"firstParty\"}");return}
if len(a)>0&&a[0]=="-p"{fake(a);return}
exe,e:=os.Executable();must(e);emit(round(a[0],exe))}
func round(fixture,exe string)map[string]any{os.Setenv(claudecode.SeamEnv,"http://127.0.0.1:1");tmp,e:=os.MkdirTemp("","hook-deny-");must(e);defer os.RemoveAll(tmp);root,home,art,hout:=filepath.Join(tmp,"checkout"),filepath.Join(tmp,"home"),filepath.Join(tmp,"artifacts"),filepath.Join(tmp,"hookout")
must(os.MkdirAll(filepath.Join(root,"protected"),0700));must(os.WriteFile(filepath.Join(root,"protected","contract.txt"),[]byte("contract\n"),0600));must(os.MkdirAll(hout,0700));must(os.MkdirAll(claudecode.RuntimeDir(home),0700));must(os.Symlink(exe,claudecode.RuntimePath(home)))
var mu sync.Mutex;events:=[]map[string]any{};ad:=claudecode.New(claudecode.Options{Home:home,HookCommand:[]string{exe,"hook"},Env:append(os.Environ(),"HOOK_DENY_FIXTURE="+fixture,"HOOK_DENY_OUT="+hout)})
s,e:=ad.Start(context.Background(),executor.Task{Role:executor.RoleBuild,Root:root,Protected:[]string{"protected/contract.txt"},Home:home,Dir:art,Model:"claude-sonnet-5-5",Effort:"high",RunID:"hook-deny",MaxRounds:1,Schema:[]byte("{\"type\":\"object\"}"),Brief:executor.Brief{Stable:"synthetic hook denial"}},func(v map[string]any){mu.Lock();defer mu.Unlock();events=append(events,v)});must(e);defer s.Close()
_,err:=s.Round(context.Background(),executor.Input{});text:="";if err!=nil{text=err.Error()}
stdout:=map[string]string{};ents,_:=os.ReadDir(hout);for _,en:=range ents{b,_:=os.ReadFile(filepath.Join(hout,en.Name()));stdout[strings.TrimSuffix(en.Name(),".out")]=string(b)}
log:=[]map[string]any{};lb,_:=os.ReadFile(filepath.Join(art,"hook-log.jsonl"));for _,l:=range strings.Split(string(lb),"\n"){if strings.TrimSpace(l)==""{continue};var m map[string]any;must(json.Unmarshal([]byte(l),&m));log=append(log,m)}
mu.Lock();defer mu.Unlock();return map[string]any{"error":text,"events":events,"hookStdout":stdout,"hookLog":log}}
func fake(a []string){var p bytes.Buffer;_,e:=p.ReadFrom(os.Stdin);must(e);var f Fixture;b,e:=os.ReadFile(os.Getenv("HOOK_DENY_FIXTURE"));must(e);must(json.Unmarshal(b,&f));sid:=flag(a,"--session-id");cwd,e:=os.Getwd();must(e);cwd,e=filepath.EvalSymlinks(cwd);must(e)
emit(map[string]any{"type":"system","subtype":"init","cwd":cwd,"session_id":sid,"mcp_servers":[]any{},"model":"claude-sonnet-5-5","permissionMode":"acceptEdits","apiKeySource":"none"})
uses:=[]any{};for _,c:=range f.Calls{uses=append(uses,map[string]any{"type":"tool_use","id":c.ID,"name":"Write","input":map[string]any{"file_path":filepath.Join(cwd,c.Path),"content":"tampered"}})}
emit(map[string]any{"type":"assistant","message":map[string]any{"content":uses}})
time.Sleep(200*time.Millisecond)
var settings struct{Hooks map[string][]struct{Hooks []struct{Command string;Args []string}}};b,e=os.ReadFile(flag(a,"--settings"));must(e);must(json.Unmarshal(b,&settings));h:=settings.Hooks["PreToolUse"][0].Hooks[0]
for _,c:=range f.Calls{target:=filepath.Join(cwd,c.Path);input:=map[string]any{"file_path":target};if c.HookPath=="-"{input=map[string]any{}}else if c.HookPath!=""{input["file_path"]=c.HookPath}
in,e:=json.Marshal(map[string]any{"session_id":sid,"cwd":cwd,"hook_event_name":"PreToolUse","permission_mode":"acceptEdits","tool_name":"Write","tool_input":input,"tool_use_id":c.ID});must(e)
cmd:=exec.Command(h.Command,h.Args...);cmd.Stdin=bytes.NewReader(in);out,e:=cmd.Output();must(e);must(os.WriteFile(filepath.Join(os.Getenv("HOOK_DENY_OUT"),c.ID+".out"),out,0600))
denied:=strings.Contains(string(out),"\"deny\"")
if c.Answer{text:="ok";if denied{text="PreToolUse:Write hook error: denied"}else{must(os.WriteFile(target,[]byte("tampered"),0600))}
emit(map[string]any{"type":"user","message":map[string]any{"content":[]any{map[string]any{"type":"tool_result","tool_use_id":c.ID,"content":text,"is_error":denied}}}})}}
emit(map[string]any{"type":"result","subtype":"success","is_error":false,"session_id":sid,"result":"done","terminal_reason":"completed","num_turns":1,"permission_denials":[]any{}})}
`;
let dir,bin;
function run(fixture){if(!bin){dir=fs.mkdtempSync(path.join(os.tmpdir(),'hook-deny-driver-'));process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));const src=path.join(dir,'main.go');bin=path.join(dir,'driver');fs.writeFileSync(src,source);const r=cp.spawnSync('go',['build','-o',bin,src],{encoding:'utf8',timeout:180000});assert.equal(r.status,0,`build synthetic driver: ${r.error||''}${r.stdout}${r.stderr}`);}
const input=path.join(dir,'fixture.json');fs.writeFileSync(input,JSON.stringify(fixture));const r=cp.spawnSync(bin,[input],{encoding:'utf8',timeout:100000});assert.equal(r.status,0,`run synthetic driver: ${r.error||''}${r.stdout}${r.stderr}`);return JSON.parse(r.stdout);}
function hooks(res){return res.events.filter(e=>e.event==='executor_hook');}
function denyEvent(res){assert.equal(res.error,'','round error');const d=hooks(res).filter(e=>e.decision==='deny');assert.equal(d.length,1,`exactly one deny executor_hook event: ${JSON.stringify(res.events)}`);return d[0];}
function checkReason(res,want){assert.equal(denyEvent(res).reason,want,'deny event reason');}
function checkNotToolText(res){const r=denyEvent(res).reason;assert.ok(typeof r==='string'&&r!==''&&r!==TOOL_TEXT,`deny event reason ${JSON.stringify(r)} must be the hook's reason, not the tool result text`);}
function checkPathFromLog(res){const d=denyEvent(res);const recs=res.hookLog.filter(r=>r.decision==='deny');assert.equal(recs.length,1,'one deny record in the hook log');assert.ok(typeof recs[0].path==='string'&&recs[0].path!=='','the hook log deny record has a path');assert.equal(d.path,recs[0].path,'deny event path equals the hook log path');}
function checkPathSuffix(res,suffix){const p=denyEvent(res).path;assert.ok(typeof p==='string'&&p.endsWith(suffix),`deny event path ${JSON.stringify(p)} ends with ${suffix}`);}
function checkNoPath(res){const d=denyEvent(res);assert.ok(!('path' in d),`deny event has no path key: ${JSON.stringify(d)}`);}
function checkAllowKeys(res,keys){const a=hooks(res).filter(e=>e.decision==='allow');assert.ok(a.length>=1,'an allow hook event exists');for(const e of a)assert.deepEqual(Object.keys(e).sort(),keys.split(',').sort(),'allow event keys');}
function checkModelText(res,reason){const d=denyEvent(res);const out=JSON.parse(res.hookStdout[d.tool_use_id]);assert.equal(out.hookSpecificOutput.permissionDecisionReason,'Kogen: '+reason,'model-facing reason');}
function controls(bad){const base=(over)=>({error:'',events:[{event:'executor_hook',decision:'allow',hook:'pretool',round:1,tool_name:'Write',tool_use_id:'a'},Object.assign({event:'executor_hook',decision:'deny',hook:'pretool',round:1,tool_name:'Write',tool_use_id:'d',reason:'the path is outside the checkout',path:'/x/outside.txt'},over||{})],hookStdout:{d:JSON.stringify({hookSpecificOutput:{permissionDecisionReason:'Kogen: the path is outside the checkout'}})},hookLog:[{decision:'allow',path:'/x/a'},{decision:'deny',path:'/x/outside.txt'}]});
const good=base();checkReason(good,'the path is outside the checkout');checkNotToolText(good);checkPathFromLog(good);checkPathSuffix(good,'outside.txt');checkAllowKeys(good,'event,decision,hook,round,tool_name,tool_use_id');checkModelText(good,'the path is outside the checkout');
const nopath=base();delete nopath.events[1].path;checkNoPath(nopath);
if(bad){const cases=[()=>checkPathFromLog(base({path:undefined})),()=>checkNotToolText(base({reason:TOOL_TEXT})),()=>checkReason(base({reason:'other'}),'the path is outside the checkout'),()=>checkNoPath(base({path:''})),()=>{const x=base();x.events[0].reason='r';checkAllowKeys(x,'event,decision,hook,round,tool_name,tool_use_id');},()=>checkPathFromLog(base({path:'/x/other'}))];
for(const c of cases){assert.throws(c);}console.log('observer rejected bad controls');process.exitCode=1;}else console.log('observer good');}
if(require.main===module)controls(process.argv[2]==='bad');else{const {When,Then}=require('@cucumber/cucumber');
When(P+'a fake Claude round runs:',{timeout:300000},function(doc){this.hookDenyResult=run(JSON.parse(doc));});
Then(P+'the deny hook event reason is {string}',function(w){checkReason(this.hookDenyResult,w);});
Then(P+'the deny hook event reason is not the tool result text',function(){checkNotToolText(this.hookDenyResult);});
Then(P+'the deny hook event path is the path of the deny record in the hook log',function(){checkPathFromLog(this.hookDenyResult);});
Then(P+'the deny hook event path ends with {string}',function(s){checkPathSuffix(this.hookDenyResult,s);});
Then(P+'the deny hook event has no path key',function(){checkNoPath(this.hookDenyResult);});
Then(P+'every allow hook event has exactly the keys {string}',function(k){checkAllowKeys(this.hookDenyResult,k);});
Then(P+'the model-facing hook output for the deny call is {string}',function(r){checkModelText(this.hookDenyResult,r);});}
