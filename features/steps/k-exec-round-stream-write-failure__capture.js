const {Then}=require('@cucumber/cucumber');
const {execFileSync}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const source=String.raw`package claudecode
import("context";"encoding/json";"os";"path/filepath";"strings";"testing";"syscall";"strconv";"github.com/KogenAI/kogen-executor/executor")
func retainedObserve(e map[string]any, artifact string) bool { return e["event"]=="executor_round_failed" && e["reason"]=="failed" && e["artifact"]==artifact && e["kept_bytes"]==float64(0) }
func TestRetainedControl(t *testing.T) { mode:=os.Getenv("RETAINED_CONTROL"); if mode=="" {t.Skip("control only")}; e:=map[string]any{"event":"executor_round_failed","reason":"failed","artifact":"round-1.jsonl","kept_bytes":float64(0)}; if mode=="bad" {e["kept_bytes"]=float64(1)}; if !retainedObserve(e,"round-1.jsonl") {t.Fatal("observer rejected")} }
func TestRetainedAcceptance(t *testing.T) {
 mode:=os.Getenv("RETAINED_CASE"); if mode=="" {t.Skip("case only")}
 token:="SYNTHETIC-retained-secret"; h:=newHarness(t,fakeConfig{Script:oneRound(finishRound), Init:tokenInitEvent,Auth:goodAuth,Result:map[string]any{"result":"done "+token}})
 o:=h.f.options(); o.Token=token
 s,e:=h.start(o); if e!=nil {t.Fatal(e)}; defer s.Close()
 ss:=s.(*session); real:=ss.bin; wrapper:=filepath.Join(t.TempDir(),"wrapper"); marker:=filepath.Join(t.TempDir(),"pid")
 script:="#!/bin/sh\necho $$ > '"+marker+"'\nexec '"+real+"' \"$@\"\n"
 if e=os.WriteFile(wrapper,[]byte(script),0700);e!=nil {t.Fatal(e)};ss.bin=wrapper
 artifact:="round-1.jsonl";if mode=="stderr" {artifact="round-1.stderr";h.f.cfg.StderrToken=true;h.f.write()}
 if mode!="fits" {if e=os.Symlink("/dev/full",filepath.Join(h.task.Dir,artifact));e!=nil {t.Fatal(e)}}
 _,e=s.Round(context.Background(),executor.Input{})
 p,pe:=os.ReadFile(marker);if pe!=nil {t.Fatal(pe)};pid,pe:=strconv.Atoi(strings.TrimSpace(string(p)));if pe!=nil {t.Fatal(pe)};if syscall.Kill(-pid,0)!=syscall.ESRCH {t.Fatal("owned process group remains")}
 if mode=="fits" {if e!=nil {t.Fatal(e)}; b,be:=os.ReadFile(filepath.Join(h.task.Dir,artifact));if be!=nil {t.Fatal(be)};if strings.Contains(string(b),token)||!strings.Contains(string(b),redactMark){t.Fatal("redaction changed")}; if len(h.eventsNamed("executor_round_ended"))!=1 {t.Fatal("missing normal ending")};return}
 if e==nil {t.Fatal("retained write failure silently succeeded")};wantError(t,e,"executor/failed")
 ev:=h.eventsNamed("executor_round_failed");if len(ev)!=1 {t.Fatal("missing failure event")};b,_:=json.Marshal(ev[0]);var decoded map[string]any;json.Unmarshal(b,&decoded);if !retainedObserve(decoded,artifact){t.Fatalf("incorrect artifact failure metadata: %s",b)};if strings.Contains(e.Error(),token)||strings.Contains(string(b),token){t.Fatal("secret disclosed")}
}
`;
function run(which,control){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'retained-'));const args=['test','./executor/claudecode','-count=1','-v','-run',control?'^TestRetainedControl$':'^TestRetainedAcceptance$'];try{fs.cpSync(process.cwd(),tmp,{recursive:true,filter:p=>!p.includes('/.git')});fs.writeFileSync(path.join(tmp,'executor/claudecode/retained_acceptance_test.go'),source);try{return execFileSync('go',args,{cwd:tmp,env:{...process.env,RETAINED_CASE:control?'':which,RETAINED_CONTROL:control?which:''},encoding:'utf8',stdio:'pipe'});}catch(e){throw new Error('go '+args.join(' ')+' exited '+e.status+'\n'+e.stdout+'\n'+e.stderr);}}finally{fs.rmSync(tmp,{recursive:true,force:true});}}
if(require.main!==module) Then('k-exec-round-stream-write-failure: {word} obeys the retained artifact contract',function(which){run(which,false);});
if(require.main===module){try{run(process.argv[2],true);console.log('accepted');}catch(e){console.log('rejected');process.exitCode=1;}}
