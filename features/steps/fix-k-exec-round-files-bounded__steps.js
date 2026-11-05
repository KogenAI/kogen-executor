'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prefix='fix-k-exec-round-files-bounded: ';
// The driver is built outside the checkout against the unchanged public API. Run with a JSON
// config it starts a real adapter session whose Claude Code runtime is the driver itself (the
// -p branch): that child writes Stderr bytes of "e" to its stderr and then finishes its round.
// Sink "full" links the round's stderr artifact to /dev/full, so every write fails; Sink "fsize"
// lowers the driver's RLIMIT_FSIZE to Limit, so the artifact takes only its first Limit bytes.
// It prints the round error, its duration, every terminal event and the size of round-1.stderr
// (-1 when that path is not a regular file).
const source=String.raw`package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

type Config struct {
	Stderr int
	Sink   string
	Limit  int
}

func must(e error) {
	if e != nil {
		panic(e)
	}
}

func emit(v any) { b, e := json.Marshal(v); must(e); fmt.Println(string(b)) }

func child(a []string) {
	var c Config
	must(json.Unmarshal([]byte(os.Getenv("FKB_CONFIG")), &c))
	_, e := io.Copy(io.Discard, os.Stdin)
	must(e)
	sid := ""
	for i, s := range a {
		if s == "--session-id" {
			sid = a[i+1]
		}
	}
	cwd, e := os.Getwd()
	must(e)
	cwd, e = filepath.EvalSymlinks(cwd)
	must(e)
	emit(map[string]any{"type": "system", "subtype": "init", "cwd": cwd, "session_id": sid, "mcp_servers": []any{}, "model": "claude-sonnet-5-5", "permissionMode": "acceptEdits", "apiKeySource": "none", "claude_code_version": "fixture"})
	_, e = io.WriteString(os.Stderr, strings.Repeat("e", c.Stderr))
	must(e)
	emit(map[string]any{"type": "result", "subtype": "success", "is_error": false, "num_turns": 1, "session_id": sid, "result": "done", "terminal_reason": "completed", "total_cost_usd": 0.1, "usage": map[string]any{"input_tokens": 1, "output_tokens": 1}})
}

func main() {
	a := os.Args[1:]
	switch {
	case len(a) > 0 && a[0] == "hook":
		os.Exit(claudecode.RunHook(a[1:], os.Stdin, os.Stdout, os.Stderr))
	case len(a) > 0 && a[0] == "--version":
		fmt.Println(claudecode.Version + " (Claude Code)")
		return
	case len(a) > 0 && a[0] == "auth":
		fmt.Println("{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"apiProvider\":\"firstParty\"}")
		return
	case len(a) > 0 && a[0] == "-p":
		child(a)
		return
	}
	var c Config
	must(json.Unmarshal([]byte(a[0]), &c))
	tmp, e := os.MkdirTemp("", "fkb-round-")
	must(e)
	defer os.RemoveAll(tmp)
	root := filepath.Join(tmp, "root")
	home := filepath.Join(tmp, "home")
	dir := filepath.Join(tmp, "artifacts")
	must(os.MkdirAll(root, 0700))
	must(os.MkdirAll(claudecode.RuntimeDir(home), 0700))
	exe, e := os.Executable()
	must(e)
	must(os.Symlink(exe, claudecode.RuntimePath(home)))
	o := claudecode.Options{Home: home, HookCommand: []string{exe, "hook"}, Env: append(os.Environ(), "FKB_CONFIG="+a[0])}
	var mu sync.Mutex
	events := []map[string]any{}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	task := executor.Task{Role: executor.RoleBuild, Root: root, Home: home, Dir: dir, Model: "claude-sonnet-5-5", Effort: "high", RunID: "fkb", MaxRounds: 1, Schema: []byte("{\"type\":\"object\"}"), Brief: executor.Brief{Stable: "synthetic stderr persistence"}}
	s, e := claudecode.New(o).Start(ctx, task, func(v map[string]any) { mu.Lock(); defer mu.Unlock(); events = append(events, v) })
	must(e)
	defer s.Close()
	switch c.Sink {
	case "full":
		must(os.Symlink("/dev/full", filepath.Join(dir, "round-1.stderr")))
	case "fsize":
		var l syscall.Rlimit
		must(syscall.Getrlimit(syscall.RLIMIT_FSIZE, &l))
		l.Cur = uint64(c.Limit)
		must(syscall.Setrlimit(syscall.RLIMIT_FSIZE, &l))
	default:
		panic("unknown sink " + c.Sink)
	}
	start := time.Now()
	_, err := s.Round(ctx, executor.Input{})
	elapsed := time.Since(start).Milliseconds()
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	size := int64(-1)
	if fi, e := os.Lstat(filepath.Join(dir, "round-1.stderr")); e == nil && fi.Mode().IsRegular() {
		size = fi.Size()
	}
	mu.Lock()
	defer mu.Unlock()
	terminals := []map[string]any{}
	for _, ev := range events {
		if ev["event"] == "executor_round_failed" || ev["event"] == "executor_round_ended" {
			terminals = append(terminals, ev)
		}
	}
	emit(map[string]any{"error": msg, "elapsed": elapsed, "terminals": terminals, "stderr_size": size})
}
`;
let dir,bin;
function run(config){
  if(!bin){
    dir=fs.mkdtempSync(path.join(os.tmpdir(),'fkb-driver-'));
    process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
    const src=path.join(dir,'main.go');bin=path.join(dir,'driver');fs.writeFileSync(src,source);
    const r=cp.spawnSync('go',['build','-o',bin,src],{encoding:'utf8',timeout:180000});
    assert.equal(r.status,0,`go build -o ${bin} ${src}: ${r.error||''}${r.stdout}${r.stderr}`);
  }
  const r=cp.spawnSync(bin,[JSON.stringify(config)],{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
  assert.equal(r.status,0,`driver ${JSON.stringify(config)} exited ${r.status}: ${r.error||''}${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout);
}
// verify compares the round with the expected outcome: the exact error, the stderr artifact size,
// exactly one terminal event holding every expected field with its exact value, and a round
// that returned within within_ms.
function verify(actual,expected){
  assert.ok(actual.elapsed<expected.within_ms,`round returned after ${actual.elapsed} ms, expected under ${expected.within_ms} ms`);
  assert.equal(actual.error,expected.error,'round error');
  assert.equal(actual.stderr_size,expected.stderr_size,'round-1.stderr size on disk (-1: not a regular file)');
  assert.equal(actual.terminals.length,1,`one terminal event, got ${JSON.stringify(actual.terminals)}`);
  const t=actual.terminals[0];
  for(const[k,v]of Object.entries(expected.terminal))assert.deepEqual(t[k],v,`terminal event field ${k} in ${JSON.stringify(t)}`);
}
// Observer controls: the known-good rounds are the terminal events observed on the unchanged
// tree with the requested stderr counts added; the known-bad rounds include that unchanged
// observation itself (no counts).
function controls(bad){
  const base={event:'executor_round_failed',role:'build',round:1,reason:'failed',deadline_remaining_ms:19991,init_ms:3,max_line_gap_ms:0,model:'claude-sonnet-5-5',requested_model:'claude-sonnet-5-5',wall_ms:17};
  const cases=[
    [{elapsed:17,error:'executor/failed: cannot persist round-1.stderr after 0 bytes',stderr_size:-1,terminals:[{...base,artifact:'round-1.stderr',detail:'cannot persist round-1.stderr after 0 bytes',kept_bytes:0,stderr_persist_truncated:true,stderr_persist_unpersisted_bytes:1048576}]},
     {within_ms:10000,error:'executor/failed: cannot persist round-1.stderr after 0 bytes',stderr_size:-1,terminal:{event:'executor_round_failed',reason:'failed',detail:'cannot persist round-1.stderr after 0 bytes',artifact:'round-1.stderr',kept_bytes:0,stderr_persist_truncated:true,stderr_persist_unpersisted_bytes:1048576}}],
    [{elapsed:15,error:'executor/failed: cannot persist round-1.stderr after 4096 bytes',stderr_size:4096,terminals:[{...base,artifact:'round-1.stderr',detail:'cannot persist round-1.stderr after 4096 bytes',kept_bytes:4096,stderr_persist_truncated:true,stderr_persist_unpersisted_bytes:1044480}]},
     {within_ms:10000,error:'executor/failed: cannot persist round-1.stderr after 4096 bytes',stderr_size:4096,terminal:{event:'executor_round_failed',reason:'failed',detail:'cannot persist round-1.stderr after 4096 bytes',artifact:'round-1.stderr',kept_bytes:4096,stderr_persist_truncated:true,stderr_persist_unpersisted_bytes:1044480}}],
  ];
  for(const[good,expected]of cases)verify(good,expected);
  if(!bad){console.log('observer good');return;}
  const mutations=[
    v=>{delete v.terminals[0].stderr_persist_truncated;delete v.terminals[0].stderr_persist_unpersisted_bytes;},
    v=>v.terminals[0].stderr_persist_unpersisted_bytes-=1,
    v=>v.terminals[0].stderr_persist_unpersisted_bytes=v.terminals[0].stderr_persist_unpersisted_bytes+v.terminals[0].kept_bytes+1,
    v=>v.terminals[0].stderr_persist_truncated=false,
    v=>v.terminals[0].kept_bytes+=1,
    v=>v.terminals[0].artifact='round-1.jsonl',
    v=>v.terminals.push({...v.terminals[0]}),
    v=>v.terminals=[],
    v=>v.error='executor/failed: artifact write failed',
    v=>v.stderr_size+=1,
    v=>v.elapsed=10000,
  ];
  for(const[good,expected]of cases)for(const mutate of mutations){const x=structuredClone(good);mutate(x);assert.throws(()=>verify(x,expected),undefined,`accepted ${mutate}`);}
  console.log('observer rejected bad');process.exitCode=1;
}
if(require.main===module)controls(process.argv[2]==='bad');
else{
  const{When,Then}=require('@cucumber/cucumber');
  When(prefix+'a round runs with:',{timeout:240000},function(doc){this.fkbRound=run(JSON.parse(doc));});
  Then(prefix+'the round outcome is:',function(doc){verify(this.fkbRound,JSON.parse(doc));});
}
