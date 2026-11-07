const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),http=require('node:http'),readline=require('node:readline'),assert=require('node:assert/strict');
const VERSION='2.1.318',TOKEN='sk-ant-oat01-kogen-acceptance-secret',SUPPORTED='claude-code 2.1.318 (Claude Code)';
// The pinned size and platform name of runtime.go's pinFor, for the two supported platforms.
const PINS={'linux/x64':{platform:'linux-x64',size:337814032},'darwin/arm64':{platform:'darwin-arm64',size:319598464}};
const source=`package main
import("bufio";"context";"encoding/json";"os";"path/filepath";cc "github.com/KogenAI/kogen-executor/executor/claudecode";ex "github.com/KogenAI/kogen-executor/executor")
func main(){h:=os.Args[1];a:=cc.New(cc.Options{Home:h,Token:os.Args[2],HookCommand:[]string{"unused"}});in:=bufio.NewScanner(os.Stdin);out:=json.NewEncoder(os.Stdout)
for in.Scan(){switch in.Text(){
case "describe":out.Encode(map[string]any{"op":"describe","version":a.Describe().Version})
case "start":events:=0;s,e:=a.Start(context.Background(),ex.Task{Role:ex.RoleBuild,Schema:json.RawMessage("{}"),Root:h,Dir:filepath.Join(h,"artifacts")},func(map[string]any){events++});msg:="";if e!=nil{msg=e.Error()};started:=s!=nil;if started{s.Close()};out.Encode(map[string]any{"op":"start","started":started,"error":msg,"events":events})}}}
`;
// Assertions on a recorded observation only.
const starts=o=>o.ops.filter(x=>x.op==='start'),describes=o=>o.ops.filter(x=>x.op==='describe');
const refusal=o=>{const s=starts(o).at(-1);assert.ok(s,'no start was recorded');return s;};
const A={
 refused(o){const s=refusal(o);assert.equal(s.started,false,'the start was accepted: '+JSON.stringify(s));assert.match(s.error,/executor\/unavailable/,s.error);},
 namesPath(o,key){assert.ok(refusal(o).error.includes(o.paths[key]),'the refusal does not name '+o.paths[key]+': '+refusal(o).error);},
 namesProblem(o,text){assert.ok(refusal(o).error.toLowerCase().includes(text.toLowerCase()),'the refusal does not say "'+text+'": '+refusal(o).error);},
 sizes(o){const e=refusal(o).error;assert.ok(e.includes(String(o.sizes.actual)),'the actual size '+o.sizes.actual+' is not named: '+e);assert.ok(e.includes(String(o.sizes.pinned)),'the pinned size '+o.sizes.pinned+' is not named: '+e);},
 remedy(o){const e=refusal(o).error;assert.ok(e.includes('remove '+o.paths.folder),'the refusal does not say to remove '+o.paths.folder+': '+e);assert.match(e,/run again/,e);},
 notAbsent(o){assert.doesNotMatch(refusal(o).error,/not installed/i,refusal(o).error);},
 untouched(o){assert.deepEqual(o.after,o.before,'the version folder changed');},
 noInvocation(o){assert.deepEqual(o.calls,[],'the fake was invoked: '+JSON.stringify(o.calls));},
 noAuth(o){assert.deepEqual(o.calls.filter(l=>l.startsWith('auth')),[],'the fake was asked to authenticate: '+JSON.stringify(o.calls));},
 noEvents(o){for(const s of starts(o))assert.equal(s.events,0,'events were emitted before the refusal');},
 noToken(o){const text=JSON.stringify(o.ops)+o.driver.stdout+o.driver.stderr;assert.ok(!text.includes(o.token),'the stored token appears in the output');},
};
function observation(kind){ // a synthetic observation of a refusal, for the observer controls
 const folder='/scratch/.kogen/claude-code/'+VERSION;const o={token:TOKEN,paths:{runtime:folder+'/claude',folder,root:'/scratch/.kogen/claude-code'},sizes:{actual:337814031,pinned:337814032},calls:[],before:{'.':{mode:0o40700}},after:{'.':{mode:0o40700}},driver:{status:0,stdout:'',stderr:''},
  ops:[{op:'describe',version:'claude-code unknown'},{op:'start',started:false,events:0,error:'executor/unavailable: Kogen\'s Claude Code at '+folder+'/claude is 337814031 bytes, expected 337814032; remove '+folder+' and run again'}]};
 if(kind==='bad')o.ops[1].error+=' (token '+TOKEN+')';return o;}
function judge(o){A.refused(o);A.namesPath(o,'runtime');A.sizes(o);A.remedy(o);A.notAbsent(o);A.untouched(o);A.noInvocation(o);A.noAuth(o);A.noEvents(o);A.noToken(o);}
if(require.main===module){try{judge(observation(process.argv[2]));console.log('accepted');}catch(e){console.log('rejected');process.exitCode=1;}}
else{
const {When,Then,After,AfterAll}=require('@cucumber/cucumber');
const P='kogen-runs-unverified-claude-code-runtime: ';
const pin=PINS[process.platform+'/'+process.arch];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let driverDir,driverBin;
function buildDriver(){if(driverBin)return driverBin;driverDir=fs.mkdtempSync(path.join(process.cwd(),'.runtime-check-driver-'));fs.writeFileSync(path.join(driverDir,'main.go'),source);driverBin=path.join(driverDir,'driver');
 const b=cp.spawnSync('go',['build','-o',driverBin,path.join(driverDir,'main.go')],{encoding:'utf8',timeout:240000});assert.equal(b.status,0,'driver build: '+b.stdout+b.stderr);return driverBin;}
AfterAll(function(){if(driverDir)fs.rmSync(driverDir,{recursive:true,force:true});});
// A stand-in claude: records every invocation, answers --version and auth, padded to a fixed length.
function script(version,calls){const body=`#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\ncase "$1" in\n--version) echo '${version} (Claude Code)';;\nauth) echo '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}';;\n*) exit 1;;\nesac\nexit 0\n`;return Buffer.concat([Buffer.from(body),Buffer.from('#'.repeat(511-body.length)+'\n')]);}
function writeStandIn(file,version,calls,size,mode){fs.writeFileSync(file,script(version,calls));fs.truncateSync(file,size);fs.chmodSync(file,mode);}
function snapshot(folder){const out={'.':{mode:fs.lstatSync(folder).mode}};const walk=(d,rel)=>{for(const n of fs.readdirSync(d)){const f=path.join(d,n),st=fs.lstatSync(f),k=path.join(rel,n);out[k]={mode:st.mode,size:st.size,mtimeMs:st.mtimeMs,link:st.isSymbolicLink()?fs.readlinkSync(f):null};if(st.isDirectory())walk(f,k);}};walk(folder,'');return out;}
const SEAM=new Set(['dangling','directory','zero-byte','mode-0644','missing']);
function fixture(w,name){const p=w.paths.runtime,calls=w.calls,size=pin.size;
 const std=(version,mode)=>writeStandIn(p,version,calls,size,mode);
 switch(name){
  case 'valid':case 'replace-rename':case 'replace-rewrite':case 'missing':std(VERSION,0o755);break;
  case 'mode-0555':std(VERSION,0o555);break;
  case 'symlink':{const dir=path.join(w.home,'target');fs.mkdirSync(dir,{mode:0o700});writeStandIn(path.join(dir,'claude'),VERSION,calls,size,0o755);fs.symlinkSync(path.join(dir,'claude'),p);break;}
  case 'dangling':fs.symlinkSync('missing-target',p);break;
  case 'directory':fs.mkdirSync(p);fs.writeFileSync(path.join(p,'keep'),'unchanged');break;
  case 'zero-byte':fs.writeFileSync(p,'',{mode:0o755});break;
  case 'mode-0644':std(VERSION,0o644);break;
  case 'truncated':std(VERSION,0o755);fs.truncateSync(p,size-1);break;
  case 'appended':std(VERSION,0o755);fs.appendFileSync(p,'x');break;
  case 'file-0775':std(VERSION,0o775);break;
  case 'file-0757':std(VERSION,0o757);break;
  case 'folder-0777':std(VERSION,0o755);fs.chmodSync(w.paths.folder,0o777);break;
  case 'root-0775':std(VERSION,0o755);fs.chmodSync(w.paths.root,0o775);break;
  default:assert.fail('unknown fixture '+name);}}
function newWorld(name){const home=fs.mkdtempSync(path.join(os.tmpdir(),'krucr-'));const root=path.join(home,'.kogen','claude-code'),folder=path.join(root,VERSION);fs.mkdirSync(folder,{recursive:true});fs.chmodSync(root,0o700);fs.chmodSync(folder,0o700);
 return {home,name,paths:{root,folder,runtime:path.join(folder,'claude')},calls:path.join(home,'calls'),requests:[],server:null};}
async function serve(w){const body=script(VERSION,w.calls),entry={checksum:crypto.createHash('sha256').update(body).digest('hex'),size:body.length};
 w.server=http.createServer((req,res)=>{w.requests.push(req.url);if(req.url==='/'+VERSION+'/manifest.json')res.end(JSON.stringify({platforms:{'linux-x64':entry,'darwin-arm64':entry}}));else if(/^\/2\.1\.318\/(linux-x64|darwin-arm64)\/claude$/.test(req.url))res.end(body);else{res.statusCode=404;res.end();}});
 await new Promise(r=>w.server.listen(0,'127.0.0.1',r));}
// Runs the driver with one adapter through the ops and records every answer.
async function drive(w,ops,replace){const env={...process.env};delete env.KOGEN_CLAUDE_CODE_URL;if(w.server)env.KOGEN_CLAUDE_CODE_URL='http://127.0.0.1:'+w.server.address().port;
 const child=cp.spawn(buildDriver(),[w.home,TOKEN],{env,stdio:['pipe','pipe','pipe']});let stderr='',stdout='';child.stderr.on('data',x=>stderr+=x);
 const lines=[],waiting=[];readline.createInterface({input:child.stdout}).on('line',l=>{stdout+=l+'\n';const r=waiting.shift();if(r)r(l);else lines.push(l);});
 const next=()=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(Error('driver gave no answer; stderr: '+stderr)),120000);const done=l=>{clearTimeout(t);res(JSON.parse(l));};if(lines.length)done(lines.shift());else waiting.push(done);});
 const closed=new Promise(r=>child.on('close',(code,sig)=>r(code===null?'signal '+sig:code)));const results=[];
 for(const op of ops){
  if(op==='describe'||op==='start'){child.stdin.write(op+'\n');results.push(await next());}
  else if(op==='delete'){fs.rmSync(w.paths.folder,{recursive:true});results.push({op});}
  else if(op==='replace'){await sleep(100);replace();results.push({op});}
  else assert.fail('unknown op '+op);}
 child.stdin.end();const status=await closed;return {ops:results,driver:{status,stdout,stderr}};}
function replacer(w,name){if(name==='replace-rename')return()=>{const n=w.paths.runtime+'.new';writeStandIn(n,'0.0.0',w.calls,pin.size,0o755);fs.renameSync(n,w.paths.runtime);};
 if(name==='replace-rewrite')return()=>{const fd=fs.openSync(w.paths.runtime,'r+');fs.writeSync(fd,script('0.0.0',w.calls),0,512,0);fs.closeSync(fd);};return()=>assert.fail('fixture '+name+' has no replacement');}
const readCalls=w=>fs.existsSync(w.calls)?fs.readFileSync(w.calls,'utf8').split('\n').filter(Boolean):[];
When(P+'the {string} runtime fixture is run through {string}',async function(name,opsText){
 assert.ok(pin,'unsupported platform '+process.platform+'/'+process.arch);
 const w=newWorld(name);this.w=w;if(SEAM.has(name))await serve(w);
 fixture(w,name);const sizes={pinned:pin.size,actual:(()=>{try{return fs.statSync(w.paths.runtime).size}catch(e){return -1}})()};
 const before=snapshot(w.paths.folder);const run=await drive(w,opsText.split(','),replacer(w,name));
 this.obs={fixture:name,token:TOKEN,paths:w.paths,sizes,before,after:snapshot(w.paths.folder),calls:readCalls(w),downloads:w.requests.filter(x=>x.endsWith('/claude')).length,ops:run.ops,driver:run.driver};
 this.attach(JSON.stringify(this.obs),'application/json');
});
When(P+'I remove the version folder named in the refusal and start again',async function(){
 const w=this.w;A.namesPath(this.obs,'folder');fs.rmSync(w.paths.folder,{recursive:true});const before=w.requests.length;
 const run=await drive(w,['start']);this.recovery={start:run.ops[0],downloads:w.requests.slice(before).filter(x=>x.endsWith('/claude')).length,driver:run.driver,installed:fs.existsSync(w.paths.runtime)};
 this.attach(JSON.stringify(this.recovery),'application/json');
});
After(async function(){if(this.w){if(this.w.server)await new Promise(r=>this.w.server.close(r));fs.rmSync(this.w.home,{recursive:true,force:true});}});
Then(P+'the start is refused as unavailable',function(){A.refused(this.obs);});
Then(P+'the refusal names the runtime path',function(){A.namesPath(this.obs,'runtime');});
Then(P+'the refusal names the version folder',function(){A.namesPath(this.obs,'folder');});
Then(P+'the refusal names the managed root',function(){A.namesPath(this.obs,'root');});
Then(P+'the refusal names the problem {string}',function(t){A.namesProblem(this.obs,t);});
Then(P+'the refusal states the actual size and the pinned size',function(){A.sizes(this.obs);});
Then(P+'the refusal says to remove the version folder and run again',function(){A.remedy(this.obs);});
Then(P+'the refusal does not call the runtime not installed',function(){A.notAbsent(this.obs);});
Then(P+'the refusal reports the replacement answer {string}',function(t){assert.ok(refusal(this.obs).error.includes(t),refusal(this.obs).error);});
Then(P+'the version folder is untouched',function(){A.untouched(this.obs);});
Then(P+'the fake was never invoked',function(){A.noInvocation(this.obs);});
Then(P+'the fake was never asked to authenticate',function(){A.noAuth(this.obs);});
Then(P+'no event was emitted by a refused start',function(){A.noEvents(this.obs);});
Then(P+'no message contains the stored token',function(){A.noToken(this.obs);});
Then(P+'Describe number {int} reports {string}',function(n,v){assert.equal(describes(this.obs)[n-1].version,v);});
Then(P+'the last Describe does not report {string}',function(v){assert.notEqual(describes(this.obs).at(-1).version,v);});
Then(P+'every start succeeds',function(){const s=starts(this.obs);assert.ok(s.length>0,'no start was recorded');for(const x of s){assert.equal(x.started,true,JSON.stringify(x));assert.equal(x.error,'');}});
Then(P+'the fake was invoked with {string}',function(a){assert.ok(this.obs.calls.includes(a),JSON.stringify(this.obs.calls));});
Then(P+'the fake answered --version {int} time(s)',function(n){assert.equal(this.obs.calls.filter(l=>l==='--version').length,n,JSON.stringify(this.obs.calls));});
Then(P+'the test origin served {int} download(s)',function(n){assert.equal(this.obs.downloads,n);});
Then(P+'the recovery start succeeds after {int} download(s)',function(n){assert.deepEqual([this.recovery.start.started,this.recovery.start.error],[true,''],JSON.stringify(this.recovery));assert.equal(this.recovery.downloads,n);assert.ok(this.recovery.installed);});
}
