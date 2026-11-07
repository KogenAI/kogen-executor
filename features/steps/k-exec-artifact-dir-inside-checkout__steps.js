'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prefix='k-exec-artifact-dir-inside-checkout: ';
const test='TestArtifactDirInCheckoutCapture';
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

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
	"github.com/KogenAI/kogen-loop/sys"
)

func TestArtifactDirInCheckoutCapture(t *testing.T) {
	var in struct {
		Dir    string   ${tag('json:"dir"')}
		Writes []string ${tag('json:"writes"')}
		Round  *struct {
			SkipHook bool                 ${tag('json:"skip_hook"')}
			Actions  []conformance.Action ${tag('json:"actions"')}
		} ${tag('json:"round"')}
	}
	must := func(e error) {
		if e != nil {
			t.Fatal(e)
		}
	}
	must(json.Unmarshal([]byte(os.Getenv("ADC_INPUT")), &in))
	h := newHarness(t, fakeConfig{})
	abs, e := filepath.EvalSymlinks(t.TempDir())
	must(e)
	r := filepath.Join(abs, "r")
	must(os.Rename(h.root, r))
	must(os.MkdirAll(filepath.Join(r, "src"), 0o755))
	must(os.MkdirAll(filepath.Join(r, ".run"), 0o755))
	must(os.Symlink(".run/exec", filepath.Join(r, "alias")))
	must(os.MkdirAll(filepath.Join(abs, "outside"), 0o755))
	must(os.Symlink(filepath.Join(r, ".run"), filepath.Join(abs, "via")))
	sub := func(s string) string { return strings.ReplaceAll(s, "$ABS", abs) }
	h.task.Root = r
	h.task.Dir = filepath.Join(abs, in.Dir)
	if in.Round != nil {
		h.f.cfg.SkipHook = in.Round.SkipHook
		h.f.cfg.Script = oneRound(conformance.RoundScript{Actions: in.Round.Actions, End: "finish", Claim: "done"})
		h.f.write()
	}
	s, err := New(h.f.options()).Start(context.Background(), h.task, func(v map[string]any) { h.events = append(h.events, v) })
	if s != nil {
		defer s.Close()
	}
	result := map[string]any{"policy_exists": false, "reason": "", "detail": ""}
	if err != nil {
		v, ok := sys.AsError(err)
		if !ok {
			t.Fatalf("untyped Start error: %v", err)
		}
		result["reason"], result["detail"] = v.Reason, v.Detail
	}
	starts := []map[string]any{}
	for _, ev := range h.events {
		if ev["event"] == "executor_started" {
			starts = append(starts, ev)
		}
	}
	result["starts"] = starts
	policyPath := filepath.Join(h.task.Dir, "hook-policy.json")
	pb, e := os.ReadFile(policyPath)
	if e != nil && !os.IsNotExist(e) {
		t.Fatal(e)
	}
	var pol map[string]any
	if e == nil {
		must(json.Unmarshal(pb, &pol))
		result["policy_exists"], result["policy"] = true, pol
		writes := []map[string]any{}
		for i, w := range in.Writes {
			input, _ := json.Marshal(map[string]any{"cwd": r, "tool_name": "Write", "tool_use_id": fmt.Sprintf("w%d", i), "tool_input": map[string]any{"file_path": sub(w), "content": "c"}})
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
	}
	if in.Round != nil && s != nil {
		h.events = nil
		_, rerr := s.Round(context.Background(), executor.Input{})
		round := map[string]any{"reason": "", "detail": ""}
		if rerr != nil {
			v, ok := sys.AsError(rerr)
			if !ok {
				t.Fatalf("untyped Round error: %v", rerr)
			}
			round["reason"], round["detail"] = v.Reason, v.Detail
		}
		after, e := os.ReadFile(policyPath)
		round["policy_unchanged"] = e == nil && bytes.Equal(after, pb)
		hooks, tools := []map[string]any{}, []map[string]any{}
		for _, ev := range h.events {
			switch {
			case ev["event"] == "executor_hook":
				hooks = append(hooks, map[string]any{"tool_use_id": ev["tool_use_id"], "decision": ev["decision"]})
			case ev["event"] == "executor_tool" && ev["name"] == "Write":
				tools = append(tools, map[string]any{"tool_use_id": ev["tool_use_id"], "denied": ev["denied"]})
			}
		}
		round["hooks"], round["writes"] = hooks, tools
		result["round"] = round
	}
	if logPath, ok := pol["log"].(string); ok {
		lb, e := os.ReadFile(logPath)
		if e != nil && !os.IsNotExist(e) {
			t.Fatal(e)
		}
		records := []map[string]any{}
		for _, line := range strings.Split(string(lb), "\n") {
			if line == "" {
				continue
			}
			var m map[string]any
			if json.Unmarshal([]byte(line), &m) != nil {
				records = append(records, map[string]any{"unparsed": line})
				continue
			}
			str := func(k string) string { v, _ := m[k].(string); return v }
			records = append(records, map[string]any{"hook": str("hook"), "tool_use_id": str("tool_use_id"), "tool_name": str("tool_name"), "decision": str("decision"), "path": str("path"), "reason": str("reason"), "nonce_ok": str("nonce") != "" && m["nonce"] == pol["nonce"]})
		}
		result["log"] = records
	}
	b, e := json.Marshal(result)
	must(e)
	must(os.WriteFile(os.Getenv("ADC_OUTPUT"), []byte(strings.ReplaceAll(string(b), abs, "$ABS")), 0o600))
}
`;
let scratch;
function run(input){
 if(!scratch){scratch=fs.mkdtempSync(path.join(os.tmpdir(),'artifact-dir-in-checkout-'));const repo=path.join(scratch,'repo');fs.cpSync(process.cwd(),repo,{recursive:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});fs.writeFileSync(path.join(repo,'executor/claudecode/artifact_dir_capture_test.go'),source);process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));}
 const output=path.join(scratch,'result.json');fs.rmSync(output,{force:true});
 const args=['test','./executor/claudecode','-run','^'+test+'$','-count=1'];
 const r=cp.spawnSync('go',args,{cwd:path.join(scratch,'repo'),env:{...process.env,ADC_INPUT:JSON.stringify(input),ADC_OUTPUT:output},encoding:'utf8',timeout:180000});
 assert.equal(r.status,0,`${test}: go ${args.join(' ')} failed: ${r.error||''}${r.stdout}${r.stderr}`);
 assert.ok(fs.existsSync(output),`${test} did not run: go ${args.join(' ')} wrote no capture output\n${r.stdout}`);
 return JSON.parse(fs.readFileSync(output,'utf8'));
}
function start(a){
 assert.equal(a.reason,'',`Start refused: ${a.reason} ${a.detail}`);
 assert.equal(a.policy_exists,true,'hook policy written');
 const s=a.starts||[];assert.equal(s.length,1,'one executor_started event');return s[0];
}
function flagged(a){const s=start(a);assert.ok(Object.hasOwn(s,'artifact_dir_in_checkout'),`start event has no artifact_dir_in_checkout: ${JSON.stringify(s)}`);assert.equal(s.artifact_dir_in_checkout,true,'start event artifact_dir_in_checkout');}
function unflagged(a){const s=start(a);assert.ok(!Object.hasOwn(s,'artifact_dir_in_checkout'),`start event has artifact_dir_in_checkout: ${JSON.stringify(s.artifact_dir_in_checkout)}`);}
function keys(a,want){assert.deepEqual(Object.keys(start(a)).sort(),[...want].sort(),'executor_started keys');}
function policy(a,want){
 start(a);const p={...a.policy};
 assert.match(String(p.nonce),/^[0-9a-f]{32}$/,'hook policy nonce');delete p.nonce;
 assert.deepEqual(p,want,'hook policy (without its nonce)');
}
function hook(a,want){
 assert.ok(Array.isArray(a.writes),'pretool ran on the written policy');
 for(const w of a.writes){assert.equal(w.code,0,`pretool exit for ${w.path}: ${w.stderr}`);assert.equal(w.stderr,'',`pretool stderr for ${w.path}`);}
 assert.deepEqual(a.writes.map(w=>({path:w.path,decision:w.decision,reason:w.reason})),want,'pretool decisions');
}
function log(a,want){
 assert.ok(Array.isArray(a.log),'hook log read');
 for(const r of a.log)assert.equal(r.nonce_ok,true,`hook log record carries the run nonce: ${JSON.stringify(r)}`);
 assert.deepEqual(a.log.map(({nonce_ok,...r})=>r),want,'hook log records in order');
}
function round(a){start(a);assert.ok(a.round,'the round ran');return a.round;}
function roundOK(a){const r=round(a);assert.equal(r.reason,'',`round failed: ${r.reason} ${r.detail}`);assert.equal(r.policy_unchanged,true,'hook policy file bytes unchanged by the round');}
function decisions(a,want){const r=round(a);assert.deepEqual({hooks:r.hooks,writes:r.writes},want,'executor_hook decisions and Write executor_tool denials');}
function roundFails(a,reason,detail){const r=round(a);assert.equal(r.reason,reason,`round error reason: ${r.detail}`);assert.ok(r.detail.includes(detail),`round error detail ${JSON.stringify(r.detail)} names ${detail}`);}
const startKeys=['auth','claude_code_version','contract','effort','event','executor','max_turns','model','role','run_id','session_id','setting_sources','version'];
function controls(bad){
 const ev={auth:{},claude_code_version:'2.1.318 (Claude Code)',contract:'kogen.executor/v2',effort:'high',event:'executor_started',executor:'claude-code',max_turns:150,model:'claude-sonnet-5-5',role:'build',run_id:'run-1',session_id:'80e8eb55-116c-4c22-b0b4-7eaefae6d286',setting_sources:'',version:'claude-code 2.1.318 (Claude Code)'};
 const nonce='35f84c06006d38d2e76ab5c04a118cb7',dir='$ABS/r/.run/exec',why='this is the executor artifact directory ('+dir+')';
 const inPolicy={root:'$ABS/r',protected:['protected/contract.txt'],log:dir+'/hook-log.jsonl',artifact_dir:dir};
 const outPolicy={root:'$ABS/r',protected:['protected/contract.txt'],log:'$ABS/outside/exec/hook-log.jsonl'};
 const inside={reason:'',detail:'',policy_exists:true,starts:[{...ev,artifact_dir_in_checkout:true}],policy:{...inPolicy,nonce},
  writes:[{path:dir+'/hook-policy.json',code:0,decision:'deny',reason:'Kogen: '+why,stderr:''},{path:'$ABS/r/src/x.go',code:0,decision:'allow',reason:'',stderr:''}],log:[]};
 const insideHook=[{path:dir+'/hook-policy.json',decision:'deny',reason:'Kogen: '+why},{path:'$ABS/r/src/x.go',decision:'allow',reason:''}];
 const outside={reason:'',detail:'',policy_exists:true,starts:[{...ev}],policy:{...outPolicy,nonce},writes:[],log:[]};
 const rec=(id,tool,hk,d,p,r)=>({hook:hk,tool_use_id:id,tool_name:tool,decision:d,path:p,reason:r});
 const roundLog=[rec('toolu_1_0','Write','pretool','allow','$ABS/r/src/x.go',''),rec('toolu_1_1','Write','pretool','deny',dir+'/hook-policy.json',why),rec('toolu_1_2','Bash','posttool','observed','','')];
 const rounded={...structuredClone(inside),writes:[],log:roundLog.map(r=>({...r,nonce_ok:true})),round:{reason:'',detail:'',policy_unchanged:true,hooks:[{tool_use_id:'toolu_1_0',decision:'allow'},{tool_use_id:'toolu_1_1',decision:'deny'}],writes:[{tool_use_id:'toolu_1_0',denied:false},{tool_use_id:'toolu_1_1',denied:true}]}};
 const roundWant={hooks:rounded.round.hooks,writes:rounded.round.writes};
 const hookless={...structuredClone(inside),writes:[],log:[],round:{reason:'protocol',detail:'hook did not run for the Write call "toolu_1_0"; the round was stopped',policy_unchanged:true,hooks:[],writes:[]}};
 const lineDetail='hook did not run for the Write call "toolu_1_0"';
 const checkInside=a=>{flagged(a);keys(a,[...startKeys,'artifact_dir_in_checkout']);policy(a,inPolicy);hook(a,insideHook);};
 const checkOutside=a=>{unflagged(a);keys(a,startKeys);policy(a,outPolicy);hook(a,[]);};
 const checkRound=a=>{flagged(a);roundOK(a);decisions(a,roundWant);log(a,roundLog);};
 const checkHookless=a=>{flagged(a);roundFails(a,'protocol',lineDetail);log(a,[]);};
 checkInside(inside);checkOutside(outside);checkRound(rounded);checkHookless(hookless);
 if(bad){
  const cases=[
   [checkInside,inside,a=>{delete a.starts[0].artifact_dir_in_checkout;}],
   [checkInside,inside,a=>{a.starts[0].artifact_dir_in_checkout='true';}],
   [checkInside,inside,a=>{a.starts.push(a.starts[0]);}],
   [checkInside,inside,a=>{a.writes[0].decision='allow';a.writes[0].reason='';}],
   [checkInside,inside,a=>{a.writes[0].reason='Kogen: this is a protected path (.run/exec)';}],
   [checkInside,inside,a=>{a.writes[1].decision='deny';}],
   [checkInside,inside,a=>{a.writes[0].code=2;}],
   [checkInside,inside,a=>{delete a.writes;}],
   [checkInside,inside,a=>{delete a.policy.artifact_dir;}],
   [checkInside,inside,a=>{a.reason='unavailable';}],
   [checkOutside,outside,a=>{a.starts[0].artifact_dir_in_checkout=false;}],
   [checkOutside,outside,a=>{a.policy.artifact_dir='$ABS/outside/exec';}],
   [checkOutside,outside,a=>{a.policy.denied=[];}],
   [checkOutside,outside,a=>{a.policy.nonce='';}],
   [checkOutside,outside,a=>{a.starts[0].extra=1;}],
   [checkRound,rounded,a=>{a.round.policy_unchanged=false;}],
   [checkRound,rounded,a=>{a.round.reason='protocol';a.round.detail='x';}],
   [checkRound,rounded,a=>{a.round.hooks[1].decision='allow';}],
   [checkRound,rounded,a=>{a.round.writes[1].denied=false;}],
   [checkRound,rounded,a=>{a.log.pop();}],
   [checkRound,rounded,a=>{a.log[1].nonce_ok=false;}],
   [checkRound,rounded,a=>{a.log[1].reason='the path is outside the checkout';}],
   [checkRound,rounded,a=>{a.log.push({unparsed:'forged'});}],
   [checkRound,rounded,a=>{delete a.round;}],
   [checkHookless,hookless,a=>{a.round.reason='';a.round.detail='';}],
   [checkHookless,hookless,a=>{a.round.detail='hook did not run for the Write call "toolu_1_1"; the round was stopped';}],
   [checkHookless,hookless,a=>{delete a.starts[0].artifact_dir_in_checkout;}],
  ];
  for(const [check,base,mutate] of cases){const a=structuredClone(base);mutate(a);let threw=false;try{check(a);}catch{threw=true;}assert.ok(threw,`mutation not rejected: ${mutate}`);}
  console.log('observer bad rejected');process.exitCode=1;
 }else console.log('observer good');
}
if(require.main===module)controls(process.argv[2]==='bad');
else{
 const{When,Then}=require('@cucumber/cucumber');
 When(prefix+'Start runs with:',{timeout:240000},function(doc){this.adc=run(JSON.parse(doc));});
 Then(prefix+'the start event records artifact_dir_in_checkout true',function(){flagged(this.adc);});
 Then(prefix+'the start event has no artifact_dir_in_checkout key',function(){unflagged(this.adc);});
 Then(prefix+'the start event has exactly the keys:',function(doc){keys(this.adc,JSON.parse(doc));});
 Then(prefix+'the hook policy without its nonce is:',function(doc){policy(this.adc,JSON.parse(doc));});
 Then(prefix+'the pretool hook answers:',function(doc){hook(this.adc,JSON.parse(doc));});
 Then(prefix+'the round succeeds and leaves the hook policy file unchanged',function(){roundOK(this.adc);});
 Then(prefix+'the round reports:',function(doc){decisions(this.adc,JSON.parse(doc));});
 Then(prefix+'the round fails as {string} with a detail containing {string}',function(reason,detail){roundFails(this.adc,reason,detail);});
 Then(prefix+'the hook log holds, each with the run nonce:',function(doc){log(this.adc,JSON.parse(doc));});
}
