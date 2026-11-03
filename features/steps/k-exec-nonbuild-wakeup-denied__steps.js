const { Then } = require('@cucumber/cucumber');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const driver = String.raw`package claudecode
import (
 "context"
 "encoding/json"
 "fmt"
 "os"
 "reflect"
 "strings"
 "testing"
 "github.com/KogenAI/kogen-executor/executor"
 "github.com/KogenAI/kogen-executor/executor/conformance"
)
type intentSpec struct { Roles []string; Rounds []int; Sentence string; ShapeTools []string; Wakeup string }
type intentObservation struct { Args, Want []string; Denied, WantDenied []string; Frame, Sentence string; Events []map[string]any; RoundError string; Finished bool }
func intentCheck(o intentObservation) error {
 if o.RoundError!="" || !o.Finished {return fmt.Errorf("round failed: %s finished=%v",o.RoundError,o.Finished)}
 if !reflect.DeepEqual(o.Args,o.Want) {return fmt.Errorf("argv got %q want %q",o.Args,o.Want)}
 if !reflect.DeepEqual(o.Denied,o.WantDenied) {return fmt.Errorf("denials got %q want %q",o.Denied,o.WantDenied)}
 if !strings.Contains(o.Frame,o.Sentence) {return fmt.Errorf("framing lacks %q",o.Sentence)}
 attempted,refused,results:=false,false,0
 for i,ev:=range o.Events {
  msg,_:=ev["message"].(map[string]any);blocks,_:=msg["content"].([]any)
  for _,b:=range blocks {if m,ok:=b.(map[string]any);ok && m["type"]=="tool_use" && m["name"]=="ScheduleWakeup" {attempted=true}}
  if c,e,ok:=toolResult(ev,"toolu_wakeup");ok {refused=e && strings.Contains(c,"unavailable")}
  if ev["type"]=="result" {results++;if i!=len(o.Events)-1 {return fmt.Errorf("trailing event")}}
 }
 if !attempted || !refused || results!=1 {return fmt.Errorf("attempt=%v refusal=%v results=%d",attempted,refused,results)}
 return nil
}
func intentDenied(a []string) []string {
 var out []string
 for i,x:=range a {if x=="--disallowedTools" && i+1<len(a) {out=append(out,strings.FieldsFunc(a[i+1],func(r rune)bool{return r==',' || r==' '})...)}}
 return out
}
func intentExpected(n int,frame,schema string) []string {
 flag:="--session-id";if n==2 {flag="--resume"}
 a:=[]string{"-p",flag,"SESSION","--model","MODEL","--effort","EFFORT","--output-format","stream-json","--verbose","--include-hook-events","--permission-mode","acceptEdits","--permission-prompts","none","--allowedTools","Bash","--settings","SETTINGS","--setting-sources","project","--strict-mcp-config","--mcp-config","{\"mcpServers\":{}}","--no-chrome","--max-turns","150"}
 if n==1 {a=append(a,"--append-system-prompt",frame)}
 return append(a,"--json-schema",schema)
}
func TestIntentNonbuildWakeup(t *testing.T) {
 var spec intentSpec;if err:=json.Unmarshal([]byte(os.Getenv("INTENT_SPEC")),&spec);err!=nil {t.Fatal(err)}
 if mode:=os.Getenv("INTENT_CONTROL");mode!="" {
  block:=func(b map[string]any)map[string]any{return map[string]any{"message":map[string]any{"content":[]any{b}}}}
  events:=[]map[string]any{block(map[string]any{"type":"tool_use","name":"ScheduleWakeup"}),block(map[string]any{"type":"tool_result","tool_use_id":"toolu_wakeup","is_error":true,"content":"ScheduleWakeup is unavailable: the tool is disallowed"}),{"type":"result"}}
  a:=intentExpected(1,spec.Sentence,"SCHEMA")
  o:=intentObservation{Args:a,Want:a,Denied:[]string{spec.Wakeup},WantDenied:[]string{spec.Wakeup},Frame:spec.Sentence,Sentence:spec.Sentence,Events:events,Finished:true}
  if mode=="bad" {o.Events=append(o.Events,map[string]any{"type":"assistant"})}
  if err:=intentCheck(o);err!=nil {t.Fatal(err)}
 } else {
  for _,role:=range spec.Roles {t.Run(role,func(t *testing.T){
   denied:=[]string{spec.Wakeup};if role=="shape" {denied=append(append([]string{},spec.ShapeTools...),spec.Wakeup)}
   for _,n:=range spec.Rounds {
    a:=roleRoundArgs(Options{SettingSources:"project"},role,"SCHEMA","SESSION",n,"MODEL","EFFORT","SETTINGS",150)
    if !reflect.DeepEqual(intentDenied(a),denied) {t.Errorf("%s round %d denials %q want %q",role,n,intentDenied(a),denied)}
    want:=intentExpected(n,constraintsFor(role),"SCHEMA")
    if role=="build" {
     want=append(want[:len(want)-2],"--disallowedTools",spec.Wakeup,"--json-schema","SCHEMA")
    } else {
     var clean []string;for i:=0;i<len(a);i++ {if a[i]=="--disallowedTools" {i++;continue};clean=append(clean,a[i])};a=clean
    }
    if !reflect.DeepEqual(a,want) {t.Errorf("%s round %d argv got %q want %q",role,n,a,want)}
   }
   r:=structuredRound("{\"verdict\":\"approve\"}");if role=="build" {r=finishRound}
   h:=roleHarness(t,role,fakeConfig{WakeupAttempt:true,Script:conformance.Script{Rounds:[]conformance.RoundScript{r,r}}});s:=h.startOK()
   for _,n:=range spec.Rounds {
    in:=executor.Input{};if n==2 {in.Feedback="continue"}
    result,err:=s.Round(context.Background(),in);message:="";if err!=nil {message=err.Error()}
    argv:=h.f.argv(n);frame:=constraintsFor(role)
    o:=intentObservation{Args:argv,Want:argv,Denied:intentDenied(argv),WantDenied:denied,Frame:frame,Sentence:spec.Sentence,Events:streamLines(t,h,fmt.Sprint(n)),RoundError:message,Finished:result.Ending==executor.EndFinish}
    if e:=intentCheck(o);e!=nil {t.Errorf("%s round %d: %v",role,n,e)}
    if n==1 && (!strings.HasPrefix(string(h.f.prompt(1)),frame+"\n\n") || argAfter(argv,"--append-system-prompt")!=frame) {t.Error("session framing missing")}
   }
  })}
 }
 if !t.Failed() {if err:=os.WriteFile(os.Getenv("INTENT_MARKER"),[]byte("observed"),0600);err!=nil {t.Fatal(err)}}
}
`;
const controlSpec = {Roles:['shape','build','review'],Rounds:[1,2],Sentence:'Scheduled wakeups are unavailable; await commands and their completion within the current round.',ShapeTools:['Edit','Write','MultiEdit','NotebookEdit'],Wakeup:'ScheduleWakeup'};
function run(spec, mode = '') {
 const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k-wakeup-'));
 try {
  fs.cpSync(process.cwd(), path.join(tmp, 'repo'), {recursive:true, filter:p => !['.git','node_modules','.kogen'].includes(path.basename(p))});
  const repo=path.join(tmp,'repo');
  fs.writeFileSync(path.join(repo,'executor/claudecode/intent_nonbuild_wakeup_test.go'),driver);
  const marker=path.join(tmp,'marker');
  const command='go test -v -count=1 -run ^TestIntentNonbuildWakeup$ ./executor/claudecode';
  const r=cp.spawnSync('go',['test','-v','-count=1','-run','^TestIntentNonbuildWakeup$','./executor/claudecode'],{cwd:repo,encoding:'utf8',timeout:180000,env:{...process.env,INTENT_CONTROL:mode,INTENT_SPEC:JSON.stringify(spec),INTENT_MARKER:marker}});
  if(r.status!==0 || !fs.existsSync(marker) || fs.readFileSync(marker,'utf8')!=='observed') throw new Error(`${command}: TestIntentNonbuildWakeup failed, absent or did not complete (status ${r.status})\n${r.stdout || ''}${r.stderr || ''}`);
 } finally {fs.rmSync(tmp,{recursive:true,force:true});}
}
if (require.main===module) {
 try {run(controlSpec,process.argv[2]);console.log('observer accepted');} catch(e) {console.log('observer rejected');process.exitCode=1;}
} else {
 Then('k-exec-nonbuild-wakeup-denied: the following round contract holds', {timeout:240000}, function(spec){run(JSON.parse(spec));});
}
