'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prefix='fix-k-exec-protected-paths-dropped-visible: ';
// The capture test is written only into a scratch copy of the checkout. It passes the raw entry
// bytes to Start, counts strings in the emitted events that are not valid UTF-8 before any
// marshalling, and writes the events as Go's encoding/json marshals them.
const source=String.raw`package claudecode
import("context";"encoding/hex";"encoding/json";"os";"reflect";"testing";"unicode/utf8")
func puInvalid(v reflect.Value) int {
 switch v.Kind() {
 case reflect.String:
  if !utf8.ValidString(v.String()) {return 1}
 case reflect.Interface, reflect.Pointer:
  if !v.IsNil() {return puInvalid(v.Elem())}
 case reflect.Slice, reflect.Array:
  n:=0;for i:=0;i<v.Len();i++ {n+=puInvalid(v.Index(i))};return n
 case reflect.Map:
  n:=0;it:=v.MapRange();for it.Next() {n+=puInvalid(it.Key())+puInvalid(it.Value())};return n
 case reflect.Struct:
  n:=0;for i:=0;i<v.NumField();i++ {n+=puInvalid(v.Field(i))};return n
 }
 return 0
}
func TestProtectedInvalidUTF8Capture(t *testing.T){
 var enc []string
 if e:=json.Unmarshal([]byte(os.Getenv("PU_INPUT")),&enc);e!=nil{t.Fatal(e)}
 paths:=make([]string,len(enc))
 for i,s:=range enc{b,e:=hex.DecodeString(s);if e!=nil{t.Fatal(e)};paths[i]=string(b)}
 h:=newHarness(t,fakeConfig{})
 h.task.Protected=paths
 s,err:=New(h.f.options()).Start(context.Background(),h.task,func(v map[string]any){h.events=append(h.events,v)})
 if s!=nil{defer s.Close()}
 result:=map[string]any{"error":"","invalid_strings":puInvalid(reflect.ValueOf(h.events)),"events":h.events}
 if err!=nil{result["error"]=err.Error()}
 b,e:=json.Marshal(result);if e!=nil{t.Fatal(e)}
 if e=os.WriteFile(os.Getenv("PU_OUTPUT"),b,0600);e!=nil{t.Fatal(e)}
}
`;
// build turns the feature's byte notation into bytes: a string is its UTF-8 text, {"bytes":"ff"}
// is raw hex and {"repeat":n,"of":[...]} repeats its parts n times.
function build(parts){return Buffer.concat(parts.map(p=>typeof p==='string'?Buffer.from(p,'utf8'):p.bytes!==undefined?Buffer.from(p.bytes,'hex'):Buffer.concat(Array.from({length:p.repeat},()=>build(p.of)))));}
let scratch;
function run(entries){
 if(!scratch){scratch=fs.mkdtempSync(path.join(os.tmpdir(),'protected-invalid-utf8-'));const repo=path.join(scratch,'repo');fs.cpSync(process.cwd(),repo,{recursive:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});fs.writeFileSync(path.join(repo,'executor/claudecode/protected_invalid_utf8_capture_test.go'),source);process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));}
 const output=path.join(scratch,'result.json');fs.rmSync(output,{force:true});
 const cmd='go test ./executor/claudecode -run ^TestProtectedInvalidUTF8Capture$ -count=1';
 const r=cp.spawnSync('go',['test','./executor/claudecode','-run','^TestProtectedInvalidUTF8Capture$','-count=1'],{cwd:path.join(scratch,'repo'),env:{...process.env,PU_INPUT:JSON.stringify(entries.map(e=>build(e).toString('hex'))),PU_OUTPUT:output},encoding:'utf8',timeout:180000});
 assert.equal(r.status,0,`TestProtectedInvalidUTF8Capture: ${cmd} failed: ${r.error||''}${r.stdout}${r.stderr}`);
 assert.ok(fs.existsSync(output),`TestProtectedInvalidUTF8Capture did not run: ${cmd} wrote no capture output: ${r.stdout}`);
 return JSON.parse(fs.readFileSync(output,'utf8'));
}
function verify(actual,expected){
 assert.equal(actual.error,'','Start failed');
 const starts=(actual.events||[]).filter(e=>e.event==='executor_started');assert.equal(starts.length,1,'one executor_started event');
 const start=starts[0];
 assert.equal(actual.invalid_strings,0,'executor_started holds strings that are not valid UTF-8 before marshalling');
 assert.equal(start.protected_dropped_count,expected.length,'protected_dropped_count');
 assert.ok(Array.isArray(start.protected_dropped),'protected_dropped list present');
 assert.equal(start.protected_dropped.length,expected.length,'protected_dropped length');
 expected.forEach((want,i)=>{
  const got=start.protected_dropped[i];
  assert.equal(got.reason,want.reason,`entry ${i} reason`);
  assert.ok(Buffer.byteLength(got.entry)<=256,`entry ${i} is ${Buffer.byteLength(got.entry)} UTF-8 bytes after JSON marshalling, over 256`);
  assert.equal(got.entry,build(want.entry).toString('utf8'),`entry ${i} text after JSON marshalling`);
 });
}
function event(entry,invalid){return {error:'',invalid_strings:invalid,events:[{event:'executor_started',protected_dropped_count:1,protected_dropped:[{entry,reason:'outside_checkout'}]}]};}
function controls(bad){
 const cases=[
  {want:['/elsewhere/�',{repeat:242,of:['a']}],old:'/elsewhere/',oldInvalid:0},
  {want:['�/../../x',{repeat:245,of:['a']}],old:'',oldInvalid:0},
  {want:['/elsewhere/',{repeat:61,of:['�a']}],old:'/elsewhere/'+'�a'.repeat(120),oldInvalid:1},
 ];
 for(const c of cases){assert.equal(build(c.want).length,c===cases[2]?255:256);verify(event(build(c.want).toString('utf8'),0),[{entry:c.want,reason:'outside_checkout'}]);}
 if(!bad){console.log('observer good');return;}
 for(const c of cases){
  const spec=[{entry:c.want,reason:'outside_checkout'}],fixed=build(c.want).toString('utf8');
  assert.throws(()=>verify(event(c.old,c.oldInvalid),spec));
  assert.throws(()=>verify(event(fixed,1),spec));
  assert.throws(()=>verify(event(fixed.slice(0,-1),0),spec));
  const wrong=event(fixed,0);wrong.events[0].protected_dropped[0].reason='empty';assert.throws(()=>verify(wrong,spec));
  const missing=event(fixed,0);delete missing.events[0].protected_dropped;assert.throws(()=>verify(missing,spec));
  const failed=event(fixed,0);failed.error='protected path root_or_parent: .';assert.throws(()=>verify(failed,spec));
 }
 assert.throws(()=>verify(event('/elsewhere/'+'�a'.repeat(120),0),[{entry:['/elsewhere/'+'�a'.repeat(120)],reason:'outside_checkout'}]));
 console.log('observer bad rejected');process.exitCode=1;
}
if(require.main===module)controls(process.argv[2]==='bad');
else{
 const{When,Then}=require('@cucumber/cucumber');
 When(prefix+'Start receives protected entry bytes:',{timeout:240000},function(doc){this.pu=run(JSON.parse(doc));});
 Then(prefix+'the dropped entries after JSON marshalling are:',function(doc){verify(this.pu,JSON.parse(doc));});
}
