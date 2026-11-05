'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prefix='k-exec-protected-hardlink-alias: ';
const test='TestProtectedHardlinkAliasCapture';
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
	"syscall"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestProtectedHardlinkAliasCapture(t *testing.T) {
	type op struct {
		File    string   ${tag('json:"file"')}
		Content string   ${tag('json:"content"')}
		Link    []string ${tag('json:"link"')}
		Symlink []string ${tag('json:"symlink"')}
		Rename  []string ${tag('json:"rename"')}
		Write   string   ${tag('json:"write"')}
	}
	var in struct {
		Protected []string ${tag('json:"protected"')}
		Before    []op     ${tag('json:"before"')}
		After     []op     ${tag('json:"after"')}
	}
	must := func(e error) {
		if e != nil {
			t.Fatal(e)
		}
	}
	must(json.Unmarshal([]byte(os.Getenv("PHA_INPUT")), &in))
	h := newHarness(t, fakeConfig{})
	abs, e := filepath.EvalSymlinks(t.TempDir())
	must(e)
	r := filepath.Join(abs, "r")
	must(os.Rename(h.root, r))
	must(os.MkdirAll(filepath.Join(abs, "outside"), 0o755))
	sub := func(s string) string { return strings.ReplaceAll(s, "$ABS", abs) }
	at := func(s string) string {
		s = sub(s)
		if filepath.IsAbs(s) {
			return s
		}
		return filepath.Join(r, s)
	}
	h.task.Root = r
	h.task.Protected = in.Protected
	policyPath := ""
	writes := []map[string]any{}
	files := []string{}
	apply := func(o op) {
		switch {
		case o.File != "":
			p := at(o.File)
			must(os.MkdirAll(filepath.Dir(p), 0o755))
			must(os.WriteFile(p, []byte(o.Content), 0o644))
			files = append(files, o.File)
		case len(o.Link) == 2:
			if err := os.Link(at(o.Link[0]), at(o.Link[1])); err != nil {
				t.Fatalf("os.Link(%s, %s) was refused, so the hard-link fixture cannot be built: %v", o.Link[0], o.Link[1], err)
			}
		case len(o.Symlink) == 2:
			must(os.Symlink(sub(o.Symlink[0]), at(o.Symlink[1])))
		case len(o.Rename) == 2:
			must(os.Rename(at(o.Rename[0]), at(o.Rename[1])))
		case o.Write != "":
			if policyPath == "" {
				t.Fatalf("write %s before Start wrote the policy", o.Write)
			}
			links := uint64(0)
			if fi, err := os.Stat(at(o.Write)); err == nil {
				if st, ok := fi.Sys().(*syscall.Stat_t); ok {
					links = uint64(st.Nlink)
				}
			}
			input, _ := json.Marshal(map[string]any{"cwd": r, "tool_name": "Write", "tool_use_id": fmt.Sprintf("w%d", len(writes)), "tool_input": map[string]any{"file_path": sub(o.Write), "content": "changed\n"}})
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
			writes = append(writes, map[string]any{"path": o.Write, "links": links, "code": code, "decision": decision, "reason": reason, "stderr": se.String()})
		default:
			t.Fatalf("unknown fixture step %+v", o)
		}
	}
	for _, o := range in.Before {
		apply(o)
	}
	s, err := New(h.f.options()).Start(context.Background(), h.task, func(v map[string]any) { h.events = append(h.events, v) })
	if s != nil {
		defer s.Close()
	}
	result := map[string]any{"reason": "", "detail": ""}
	if err != nil {
		v, ok := sys.AsError(err)
		if !ok {
			t.Fatalf("untyped Start error: %v", err)
		}
		result["reason"], result["detail"] = v.Reason, v.Detail
	} else {
		policyPath = filepath.Join(h.task.Dir, "hook-policy.json")
		for _, o := range in.After {
			apply(o)
		}
		pb, e := os.ReadFile(policyPath)
		must(e)
		var pol policy
		must(json.Unmarshal(pb, &pol))
		lb, e := os.ReadFile(pol.Log)
		must(e)
		log := []map[string]any{}
		for _, line := range strings.Split(string(lb), "\n") {
			if line == "" {
				continue
			}
			var rec sentinel
			must(json.Unmarshal([]byte(line), &rec))
			log = append(log, map[string]any{"nonce_ok": pol.Nonce != "" && rec.Nonce == pol.Nonce, "hook": rec.Hook, "tool_use_id": rec.ToolUseID, "tool_name": rec.ToolName, "decision": rec.Decision, "path": rec.Path, "reason": rec.Reason})
		}
		result["log"] = log
	}
	contents := map[string]any{}
	for _, f := range files {
		if b, e := os.ReadFile(at(f)); e == nil {
			contents[f] = string(b)
		} else {
			contents[f] = nil
		}
	}
	result["writes"], result["contents"] = writes, contents
	b, e := json.Marshal(result)
	must(e)
	must(os.WriteFile(os.Getenv("PHA_OUTPUT"), []byte(strings.ReplaceAll(string(b), abs, "$ABS")), 0o600))
}
`;
let scratch;
function run(input){
 if(!scratch){scratch=fs.mkdtempSync(path.join(os.tmpdir(),'protected-hardlink-alias-'));const repo=path.join(scratch,'repo');fs.cpSync(process.cwd(),repo,{recursive:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});fs.writeFileSync(path.join(repo,'executor/claudecode/protected_hardlink_alias_capture_test.go'),source);process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));}
 const output=path.join(scratch,'result.json');fs.rmSync(output,{force:true});
 const args=['test','./executor/claudecode','-run','^'+test+'$','-count=1'];
 const r=cp.spawnSync('go',args,{cwd:path.join(scratch,'repo'),env:{...process.env,PHA_INPUT:JSON.stringify(input),PHA_OUTPUT:output},encoding:'utf8',timeout:180000});
 assert.equal(r.status,0,`${test}: go ${args.join(' ')} failed: ${r.error||''}${r.stdout}${r.stderr}`);
 assert.ok(fs.existsSync(output),`${test} did not run: go ${args.join(' ')} wrote no capture output\n${r.stdout}`);
 return JSON.parse(fs.readFileSync(output,'utf8'));
}
function started(a){assert.equal(a.reason,'',`Start refused: ${a.reason} ${a.detail}`);assert.ok(Array.isArray(a.log),'Start wrote the policy and the hook log');}
function hook(a,want){
 started(a);
 for(const w of a.writes){assert.equal(w.code,0,`pretool exit for ${w.path}: ${w.stderr}`);assert.equal(w.stderr,'',`pretool stderr for ${w.path}`);}
 assert.deepEqual(a.writes.map(w=>({path:w.path,links:w.links,decision:w.decision,reason:w.reason})),want,'pretool decisions (links is the target\'s link count when the hook ran)');
}
function log(a,want){
 started(a);
 for(const r of a.log)assert.equal(r.nonce_ok,true,`hook log record ${r.tool_use_id} carries the run nonce`);
 assert.deepEqual(a.log.map(r=>({hook:r.hook,tool_use_id:r.tool_use_id,tool_name:r.tool_name,decision:r.decision,path:r.path,reason:r.reason})),want,'hook log records');
}
function contents(a,want){assert.deepEqual(a.contents,want,'file contents after the hook calls');}
function controls(bad){
 const good={reason:'',detail:'',
  writes:[{path:'alias.txt',links:2,code:0,decision:'deny',reason:'Kogen: this is a hard link to a protected path (locked.txt)',stderr:''},{path:'plain.txt',links:1,code:0,decision:'allow',reason:'',stderr:''}],
  log:[{nonce_ok:true,hook:'pretool',tool_use_id:'w0',tool_name:'Write',decision:'deny',path:'$ABS/r/alias.txt',reason:'this is a hard link to a protected path (locked.txt)'},{nonce_ok:true,hook:'pretool',tool_use_id:'w1',tool_name:'Write',decision:'allow',path:'$ABS/r/plain.txt',reason:''}],
  contents:{'locked.txt':'locked\n','plain.txt':'plain\n'}};
 const hookWant=[{path:'alias.txt',links:2,decision:'deny',reason:'Kogen: this is a hard link to a protected path (locked.txt)'},{path:'plain.txt',links:1,decision:'allow',reason:''}];
 const logWant=[{hook:'pretool',tool_use_id:'w0',tool_name:'Write',decision:'deny',path:'$ABS/r/alias.txt',reason:'this is a hard link to a protected path (locked.txt)'},{hook:'pretool',tool_use_id:'w1',tool_name:'Write',decision:'allow',path:'$ABS/r/plain.txt',reason:''}];
 const contentsWant={'locked.txt':'locked\n','plain.txt':'plain\n'};
 const check=a=>{hook(a,hookWant);log(a,logWant);contents(a,contentsWant);};
 check(good);
 if(bad){
  const mutations=[
   a=>{a.writes[0].decision='allow';a.writes[0].reason='';},
   a=>a.writes[0].reason='Kogen: this is a protected path (locked.txt)',
   a=>a.writes[0].links=1,
   a=>a.writes[1].decision='deny',
   a=>a.writes[0].code=2,
   a=>a.writes[0].stderr='kogen executor hook: invalid policy\n',
   a=>a.writes.pop(),
   a=>a.reason='unavailable',
   a=>delete a.log,
   a=>a.log[0].decision='allow',
   a=>a.log[0].nonce_ok=false,
   a=>a.log[0].reason='Kogen: this is a hard link to a protected path (locked.txt)',
   a=>a.log.pop(),
   a=>a.contents['locked.txt']='changed\n',
  ];
  for(const m of mutations){const a=structuredClone(good);m(a);assert.throws(()=>check(a));}
  console.log('observer bad rejected');process.exitCode=1;
 }else console.log('observer good');
}
if(require.main===module){
 if(process.argv[2]==='capture')console.log(JSON.stringify(run(JSON.parse(process.argv[3]))));
 else controls(process.argv[2]==='bad');
}else{
 const{When,Then}=require('@cucumber/cucumber');
 When(prefix+'Start runs and then:',{timeout:240000},function(doc){this.pha=run(JSON.parse(doc));});
 Then(prefix+'the pretool hook answers:',function(doc){hook(this.pha,JSON.parse(doc));});
 Then(prefix+'the hook log holds, each with the run nonce:',function(doc){log(this.pha,JSON.parse(doc));});
 Then(prefix+'the files keep their contents:',function(doc){contents(this.pha,JSON.parse(doc));});
}
