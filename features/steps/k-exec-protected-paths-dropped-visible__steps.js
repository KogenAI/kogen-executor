'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prefix='k-exec-protected-paths-dropped-visible: ';
const source=String.raw`package claudecode
import("context";"encoding/json";"os";"path/filepath";"strings";"testing";"github.com/KogenAI/kogen-loop/sys")
func TestProtectedVisibilityCapture(t *testing.T){
 var paths []string
 if e:=json.Unmarshal([]byte(os.Getenv("PV_INPUT")),&paths);e!=nil{t.Fatal(e)}
 h:=newHarness(t,fakeConfig{})
 root,e:=filepath.EvalSymlinks(h.root);if e!=nil{t.Fatal(e)}
 for i,p:=range paths {paths[i]=strings.ReplaceAll(p,"$ROOT",root)}
 h.task.Protected=paths
 s,err:=New(h.f.options()).Start(context.Background(),h.task,func(v map[string]any){h.events=append(h.events,v)})
 if s!=nil{defer s.Close()}
 result:=map[string]any{"events":h.events,"policy_exists":false,"settings_exists":false,"reason":"","detail":""}
 if err!=nil{v,ok:=sys.AsError(err);if !ok{t.Fatalf("untyped Start error: %v",err)};result["reason"]=v.Reason;result["detail"]=strings.ReplaceAll(v.Detail,root,"$ROOT")}
 b,e:=os.ReadFile(filepath.Join(h.task.Dir,"hook-policy.json"));if e==nil{var p map[string]any;if e=json.Unmarshal(b,&p);e!=nil{t.Fatal(e)};result["policy_exists"]=true;result["protected"]=p["protected"]}else if !os.IsNotExist(e){t.Fatal(e)}
 if _,e=os.Stat(filepath.Join(h.task.Dir,"claude-settings.json"));e==nil{result["settings_exists"]=true}else if !os.IsNotExist(e){t.Fatal(e)}
 b,e=json.Marshal(result);if e!=nil{t.Fatal(e)};b=[]byte(strings.ReplaceAll(string(b),root,"$ROOT"));if e=os.WriteFile(os.Getenv("PV_OUTPUT"),b,0600);e!=nil{t.Fatal(e)}
}
`;
let scratch;
function run(input){
 if(!scratch){scratch=fs.mkdtempSync(path.join(os.tmpdir(),'protected-visible-'));const repo=path.join(scratch,'repo');fs.cpSync(process.cwd(),repo,{recursive:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});fs.writeFileSync(path.join(repo,'executor/claudecode/protected_visibility_capture_test.go'),source);process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));}
 const output=path.join(scratch,'result.json');fs.rmSync(output,{force:true});
 const r=cp.spawnSync('go',['test','./executor/claudecode','-run','^TestProtectedVisibilityCapture$','-count=1'],{cwd:path.join(scratch,'repo'),env:{...process.env,PV_INPUT:JSON.stringify(input),PV_OUTPUT:output},encoding:'utf8',timeout:180000});
 assert.equal(r.status,0,`TestProtectedVisibilityCapture: go test ./executor/claudecode -run ^TestProtectedVisibilityCapture$ -count=1: ${r.error||''}${r.stdout}${r.stderr}`);assert.ok(fs.existsSync(output),'TestProtectedVisibilityCapture did not run: capture output absent');return JSON.parse(fs.readFileSync(output,'utf8'));
}
function verify(actual,spec){
 assert.equal(actual.reason,spec.reason||'','typed reason');
 if(spec.reason){assert.ok(actual.detail.includes(spec.entry),'error names entry');assert.equal(actual.policy_exists,false,'no policy on refusal');assert.equal(actual.settings_exists,false,'no settings on refusal');assert.equal((actual.events||[]).filter(e=>e.event==='executor_started').length,0,'no started event on refusal');return;}
 assert.equal(actual.policy_exists,true);assert.equal(actual.settings_exists,true);assert.deepEqual(actual.protected,spec.policy,'policy order and normalization');
 const starts=(actual.events||[]).filter(e=>e.event==='executor_started');assert.equal(starts.length,1,'one start');const start=starts[0];
 if(!spec.count){assert.ok(!Object.hasOwn(start,'protected_dropped'),'omit list without drops');assert.ok(!Object.hasOwn(start,'protected_dropped_count'),'omit count without drops');return;}
 assert.equal(start.protected_dropped_count,spec.count,'full count');assert.deepEqual(start.protected_dropped,spec.dropped,'first 20 bounded entries in order');
 for(const item of start.protected_dropped)assert.ok(Buffer.byteLength(item.entry)<=256,'entry bounded to 256 UTF-8 bytes');
}
function controls(bad){
 const spec={policy:['a.txt'],count:2,dropped:[{entry:'',reason:'empty'},{entry:'/elsewhere/f',reason:'outside_checkout'}]};
 const good={reason:'',policy_exists:true,settings_exists:true,protected:['a.txt'],events:[{event:'executor_started',protected_dropped_count:2,protected_dropped:spec.dropped}]};
 verify(good,spec);verify({reason:'unavailable',detail:'refused .',policy_exists:false,settings_exists:false,events:[]},{reason:'unavailable',entry:'.'});
 verify({reason:'',policy_exists:true,settings_exists:true,protected:['a'],events:[{event:'executor_started'}]},{policy:['a']});
 const many={policy:['a'],count:100,dropped:Array.from({length:20},(_,i)=>({entry:'/elsewhere/'+i,reason:'outside_checkout'}))};verify({reason:'',policy_exists:true,settings_exists:true,protected:['a'],events:[{event:'executor_started',protected_dropped_count:100,protected_dropped:many.dropped}]},many);
 if(bad){const mutations=[a=>a.events[0].protected_dropped_count=20,a=>a.events[0].protected_dropped.reverse(),a=>a.events[0].protected_dropped[0].reason='outside_checkout',a=>a.protected.push('bad'),a=>delete a.events[0].protected_dropped];for(const mutate of mutations){const a=structuredClone(good);mutate(a);assert.throws(()=>verify(a,spec));}assert.throws(()=>verify({reason:'unavailable',detail:'refused .',policy_exists:true,settings_exists:false,events:[]},{reason:'unavailable',entry:'.'}));console.log('observer bad rejected');process.exitCode=1;}else console.log('observer good');
}
if(require.main===module)controls(process.argv[2]==='bad');else{const{When,Then}=require('@cucumber/cucumber');When(prefix+'Start receives protected entries:',{timeout:240000},function(doc){let input=JSON.parse(doc);if(input.repeat)input=Array.from({length:input.repeat},(_,i)=>input.entry.replace('$I',String(i)));this.pv=run(input);});Then(prefix+'the outcome is:',function(doc){const spec=JSON.parse(doc);if(spec.generate)spec.dropped=Array.from({length:20},(_,i)=>({entry:spec.generate.replace('$I',String(i)),reason:'outside_checkout'}));verify(this.pv,spec);});}
