'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prefix='k-exec-protected-absolute-path-symlinked-root: ';
const test='TestSymlinkedRootProtectedCapture';
const tag=s=>'`'+s+'`';
const source=String.raw`package claudecode

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestSymlinkedRootProtectedCapture(t *testing.T) {
	var in struct {
		Root      string   ${tag('json:"root"')}
		Protected []string ${tag('json:"protected"')}
		Writes    []string ${tag('json:"writes"')}
	}
	if e := json.Unmarshal([]byte(os.Getenv("PSR_INPUT")), &in); e != nil {
		t.Fatal(e)
	}
	must := func(e error) {
		if e != nil {
			t.Fatal(e)
		}
	}
	h := newHarness(t, fakeConfig{})
	abs, e := filepath.EvalSymlinks(t.TempDir())
	must(e)
	real := filepath.Join(abs, "real")
	must(os.Rename(h.root, real))
	must(os.MkdirAll(filepath.Join(real, "a"), 0o755))
	must(os.WriteFile(filepath.Join(real, "a", "b.txt"), []byte("x\n"), 0o644))
	must(os.MkdirAll(filepath.Join(real, "c"), 0o755))
	must(os.Symlink("c", filepath.Join(real, "inner")))
	must(os.MkdirAll(filepath.Join(abs, "elsewhere"), 0o755))
	must(os.Symlink(filepath.Join(abs, "elsewhere"), filepath.Join(real, "out")))
	must(os.Symlink(real, filepath.Join(abs, "link")))
	sub := func(s string) string { return strings.ReplaceAll(s, "$ABS", abs) }
	h.task.Root = filepath.Join(abs, in.Root)
	h.task.Protected = nil
	for _, p := range in.Protected {
		h.task.Protected = append(h.task.Protected, sub(p))
	}
	s, err := New(h.f.options()).Start(context.Background(), h.task, func(v map[string]any) { h.events = append(h.events, v) })
	if s != nil {
		defer s.Close()
	}
	result := map[string]any{"events": h.events, "policy_exists": false, "settings_exists": false, "reason": "", "detail": ""}
	if err != nil {
		v, ok := sys.AsError(err)
		if !ok {
			t.Fatalf("untyped Start error: %v", err)
		}
		result["reason"], result["detail"] = v.Reason, v.Detail
	}
	policyPath := filepath.Join(h.task.Dir, "hook-policy.json")
	if b, e := os.ReadFile(policyPath); e == nil {
		var p policy
		must(json.Unmarshal(b, &p))
		result["policy_exists"], result["protected"], result["policy_root"] = true, p.Protected, p.Root
		writes := []map[string]any{}
		for i, w := range in.Writes {
			input, _ := json.Marshal(map[string]any{"cwd": real, "tool_name": "Write", "tool_use_id": fmt.Sprintf("w%d", i), "tool_input": map[string]any{"file_path": sub(w), "content": "c"}})
			var so, se bytes.Buffer
			code := RunHook([]string{"pretool", "--policy", policyPath}, bytes.NewReader(input), &so, &se)
			decision, reason := "allow", ""
			if so.Len() > 0 {
				var out struct {
					H struct {
						D string ${tag('json:"permissionDecision"')}
						R string ${tag('json:"permissionDecisionReason"')}
					} ${tag('json:"hookSpecificOutput"')}
				}
				must(json.Unmarshal(so.Bytes(), &out))
				decision, reason = out.H.D, out.H.R
			}
			writes = append(writes, map[string]any{"path": w, "code": code, "decision": decision, "reason": reason, "stderr": se.String()})
		}
		result["writes"] = writes
	} else if !os.IsNotExist(e) {
		t.Fatal(e)
	}
	if _, e := os.Stat(filepath.Join(h.task.Dir, "claude-settings.json")); e == nil {
		result["settings_exists"] = true
	} else if !os.IsNotExist(e) {
		t.Fatal(e)
	}
	b, e := json.Marshal(result)
	must(e)
	must(os.WriteFile(os.Getenv("PSR_OUTPUT"), []byte(strings.ReplaceAll(string(b), abs, "$ABS")), 0o600))
}
`;
let scratch;
function run(input){
 if(!scratch){scratch=fs.mkdtempSync(path.join(os.tmpdir(),'protected-symlinked-root-'));const repo=path.join(scratch,'repo');fs.cpSync(process.cwd(),repo,{recursive:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});fs.writeFileSync(path.join(repo,'executor/claudecode/symlinked_root_capture_test.go'),source);process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));}
 const output=path.join(scratch,'result.json');fs.rmSync(output,{force:true});
 const args=['test','./executor/claudecode','-run','^'+test+'$','-count=1'];
 const r=cp.spawnSync('go',args,{cwd:path.join(scratch,'repo'),env:{...process.env,PSR_INPUT:JSON.stringify(input),PSR_OUTPUT:output},encoding:'utf8',timeout:180000});
 assert.equal(r.status,0,`${test}: go ${args.join(' ')} failed: ${r.error||''}${r.stdout}${r.stderr}`);
 assert.ok(fs.existsSync(output),`${test} did not run: go ${args.join(' ')} wrote no capture output\n${r.stdout}`);
 return JSON.parse(fs.readFileSync(output,'utf8'));
}
function starts(a){return (a.events||[]).filter(e=>e.event==='executor_started');}
function succeeds(a,policy){
 assert.equal(a.reason,'',`Start refused: ${a.reason} ${a.detail}`);
 assert.equal(a.policy_exists,true,'hook policy written');assert.equal(a.settings_exists,true,'hook settings written');
 assert.equal(a.policy_root,'$ABS/real','policy root is the resolved checkout');
 assert.deepEqual(a.protected??[],policy,`policy protected entries; start event: ${JSON.stringify(starts(a).map(s=>s.protected_dropped))}`);
 assert.equal(starts(a).length,1,'one executor_started event');
}
function noDrops(a){const s=starts(a);assert.equal(s.length,1,'one executor_started event');assert.ok(!Object.hasOwn(s[0],'protected_dropped'),`no dropped list: ${JSON.stringify(s[0].protected_dropped)}`);assert.ok(!Object.hasOwn(s[0],'protected_dropped_count'),'no dropped count');}
function drops(a,want){const s=starts(a);assert.equal(s.length,1,'one executor_started event');assert.deepEqual(s[0].protected_dropped,want,'dropped entries');assert.equal(s[0].protected_dropped_count,want.length,'dropped count');}
function refused(a,reason,entry){
 assert.equal(a.reason,reason,`typed Start refusal; policy ${JSON.stringify(a.protected)} start ${JSON.stringify(starts(a).map(s=>s.protected_dropped))}`);assert.ok(a.detail.includes(entry),`refusal names ${entry}: ${a.detail}`);
 assert.equal(a.policy_exists,false,'no policy on refusal');assert.equal(a.settings_exists,false,'no settings on refusal');assert.equal(starts(a).length,0,'no executor_started on refusal');
}
function hook(a,want){
 assert.ok(Array.isArray(a.writes),'pretool ran on the written policy');
 for(const w of a.writes)assert.equal(w.code,0,`pretool exit for ${w.path}: ${w.stderr}`);
 assert.deepEqual(a.writes.map(w=>({path:w.path,decision:w.decision,reason:w.reason})),want,'pretool decisions');
}
function controls(bad){
 const good={reason:'',detail:'',policy_exists:true,settings_exists:true,policy_root:'$ABS/real',protected:['a/b.txt'],events:[{event:'executor_started'}],writes:[{path:'$ABS/link/a/b.txt',code:0,decision:'deny',reason:'Kogen: this is a protected path (a/b.txt)',stderr:''},{path:'$ABS/real/a/c.txt',code:0,decision:'allow',reason:'',stderr:''}]};
 const hookWant=[{path:'$ABS/link/a/b.txt',decision:'deny',reason:'Kogen: this is a protected path (a/b.txt)'},{path:'$ABS/real/a/c.txt',decision:'allow',reason:''}];
 const dropped={...structuredClone(good),protected:null,events:[{event:'executor_started',protected_dropped_count:1,protected_dropped:[{entry:'$ABS/elsewhere/f',reason:'outside_checkout'}]}]};
 const refusal={reason:'unavailable',detail:'protected path root_or_parent: $ABS/link',policy_exists:false,settings_exists:false,events:[]};
 const check=a=>{succeeds(a,['a/b.txt']);noDrops(a);hook(a,hookWant);};
 check(good);succeeds(dropped,[]);drops(dropped,[{entry:'$ABS/elsewhere/f',reason:'outside_checkout'}]);refused(refusal,'unavailable','root_or_parent: $ABS/link');
 if(bad){
  const mutations=[a=>a.protected=[],a=>a.protected=['link/a/b.txt'],a=>a.policy_root='$ABS/link',a=>{a.events[0].protected_dropped_count=1;a.events[0].protected_dropped=[{entry:'$ABS/link/a/b.txt',reason:'outside_checkout'}];},a=>a.writes[0].decision='allow',a=>a.writes[1].decision='deny',a=>a.writes[0].code=2,a=>a.reason='unavailable',a=>a.events.push({event:'executor_started'}),a=>delete a.writes];
  for(const m of mutations){const a=structuredClone(good);m(a);assert.throws(()=>check(a));}
  assert.throws(()=>drops(good,[{entry:'$ABS/elsewhere/f',reason:'outside_checkout'}]));
  assert.throws(()=>refused({...refusal,policy_exists:true},'unavailable','root_or_parent: $ABS/link'));
  assert.throws(()=>refused({...refusal,detail:'protected path root_or_parent: $ABS'},'unavailable','root_or_parent: $ABS/link'));
  assert.throws(()=>refused(good,'unavailable','root_or_parent: $ABS/link'));
  console.log('observer bad rejected');process.exitCode=1;
 }else console.log('observer good');
}
if(require.main===module)controls(process.argv[2]==='bad');
else{
 const{When,Then}=require('@cucumber/cucumber');
 When(prefix+'Start runs with:',{timeout:240000},function(doc){this.psr=run(JSON.parse(doc));});
 Then(prefix+'Start succeeds with the policy:',function(doc){succeeds(this.psr,JSON.parse(doc));});
 Then(prefix+'the start event lists no dropped entries',function(){noDrops(this.psr);});
 Then(prefix+'the start event drops:',function(doc){drops(this.psr,JSON.parse(doc));});
 Then(prefix+'Start is refused as {string} naming {string}',function(reason,entry){refused(this.psr,reason,entry);});
 Then(prefix+'the pretool hook answers:',function(doc){hook(this.psr,JSON.parse(doc));});
}
