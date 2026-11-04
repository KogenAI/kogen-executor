const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');
function verify(got, want) {
  for (const [key, value] of Object.entries(want)) assert.deepEqual(got[key], value, `${key}: ${JSON.stringify(got)}`);
}
const source = `package claudecode
import (
 "bytes"
 "context"
 "encoding/json"
 "fmt"
 "net/http"
 "os"
 "path/filepath"
 "regexp"
 "strings"
 "sync"
 "sync/atomic"
 "testing"
 "time"
 "syscall"
)
var retryCaptureLine=regexp.MustCompile("(?i)retry(?:ing)?[ :]")
func retryLockHeld(home string) bool {
 f,e:=os.OpenFile(filepath.Join(Root(home),"install.lock"),os.O_RDWR,0600)
 if e!=nil {return false};defer f.Close()
 e=syscall.Flock(int(f.Fd()),syscall.LOCK_EX|syscall.LOCK_NB)
 return e==syscall.EWOULDBLOCK
}
type retryCaptureWriter struct { mu sync.Mutex; b bytes.Buffer; cancel context.CancelFunc; home string; held atomic.Bool; pauses atomic.Int32; pending sync.WaitGroup }
func (w *retryCaptureWriter) Write(p []byte)(int,error) {
 w.mu.Lock(); defer w.mu.Unlock()
 n,e:=w.b.Write(p)
 if retryCaptureLine.Match(p) {
  w.pending.Add(1)
  go func(){defer w.pending.Done();time.Sleep(10*time.Millisecond);if !retryLockHeld(w.home) {w.held.Store(false)};w.pauses.Add(1);if w.cancel!=nil {w.cancel()}}()
 }
 return n,e
}
func TestIntentRetryCapture(t *testing.T) {
 mode:=os.Getenv("INTENT_RETRY_MODE")
 home:=t.TempDir()
 binary:=script(Version,filepath.Join(t.TempDir(),"runs"))
 ctx,cancel:=context.WithTimeout(context.Background(),8*time.Second); defer cancel()
 w:=&retryCaptureWriter{home:home};w.held.Store(true)
 if mode=="cancel" {w.cancel=cancel}
 checksum:=""
 if mode=="checksum" {checksum=strings.Repeat("0",64)}
 s:=newSeam(t,binary,checksum,nil)
 old:=s.Config.Handler
 s.Config.Handler=http.HandlerFunc(func(out http.ResponseWriter,r *http.Request){
  if !strings.HasSuffix(r.URL.Path,"/claude") {out.Header().Set("Connection","close");old.ServeHTTP(out,r);return}
  if !retryLockHeld(home) {w.held.Store(false)}
  n:=s.downloads.Add(1)
  if (mode=="503-once" && n==1)||mode=="503"||mode=="cancel" {out.WriteHeader(503);return}
  if mode=="429-once" && n==1 {out.WriteHeader(429);return}
  if mode=="404" {out.WriteHeader(404);return}
  if mode=="403" {out.WriteHeader(403);return}
  if mode=="disconnect" && n==1 {
   c,buf,e:=out.(http.Hijacker).Hijack();if e!=nil {panic(e)}
   fmt.Fprintf(buf,"HTTP/1.1 200 OK\\r\\nContent-Length: %d\\r\\n\\r\\n",len(binary));buf.Write(binary[:len(binary)/2]);buf.Flush();c.Close();return
  }
  if mode=="connect" && n==1 {c,_,e:=out.(http.Hijacker).Hijack();if e!=nil {panic(e)};c.Close();return}
  if mode=="stall" {out.Header().Set("Content-Length",fmt.Sprint(len(binary)));out.WriteHeader(200);out.(http.Flusher).Flush();<-r.Context().Done();return}
  if mode=="size" {out.Write(binary[:len(binary)-1]);return}
  out.Header().Set("Content-Length",fmt.Sprint(len(binary)));out.Write(binary)
 })
 sourceURL:=s.URL+"/"+Version+"/linux-x64/claude"
 a:=installer(home,nil);a.opts.Stderr=w
 a.setDownloadIdleTimeoutForTest(30*time.Millisecond)
 if seam,ok:=any(a).(interface{setDownloadRetryDelayForTest(time.Duration)});ok {seam.setDownloadRetryDelayForTest(100*time.Millisecond)}
 started:=time.Now()
 err:=a.ensureRuntime(ctx)
 elapsed:=time.Since(started)
 w.pending.Wait()
 w.mu.Lock();text:=w.b.String();w.mu.Unlock()
 retries:=0;linesOK:=true
 for _,line:=range strings.Split(text,"\\n") {if retryCaptureLine.MatchString(line) {retries++; if !strings.Contains(line,fmt.Sprint(retries)) || !(strings.Contains(line,"HTTP")||strings.Contains(strings.ToLower(line),"eof")||strings.Contains(strings.ToLower(line),"connection")) {linesOK=false}}}
 data,_:=os.ReadFile(RuntimePath(home))
 partial,_:=filepath.Glob(filepath.Join(Root(home),".partial-*"))
 released:=!retryLockHeld(home)
 detail:="";if err!=nil {detail=err.Error()}
 result:=map[string]any{"requests":s.downloads.Load(),"success":err==nil,"matches":bytes.Equal(data,binary),"retries":retries,"retryLinesValid":linesOK,"partialCount":len(partial),"lockReleased":released,"lockHeld":w.held.Load(),"pausesChecked":w.pauses.Load(),"source":strings.Contains(detail,sourceURL),"http503":strings.Contains(detail,"HTTP 503"),"attempts3":strings.Contains(detail,"3 attempts"),"mismatch":strings.Contains(detail,"does not match"),"interrupt":strings.Contains(detail,"executor/interrupted"),"prompt":elapsed<time.Second}
 raw,e:=json.Marshal(result);if e!=nil {t.Fatal(e)}
 if e=os.WriteFile(os.Getenv("INTENT_RETRY_RESULT"),raw,0600);e!=nil {t.Fatal(e)}
}
`;
function run(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-retry-'));
  try {
    const target = path.resolve('executor/claudecode/intent_retry_capture_test.go');
    const fixture = path.join(root, 'capture_test.go');
    const result = path.join(root, 'result.json');
    fs.writeFileSync(fixture, source);
    const overlay = path.join(root, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace:{[target]:fixture}}));
    const proc = cp.spawnSync('go', ['test', '-overlay', overlay, './executor/claudecode', '-run', '^TestIntentRetryCapture$', '-count=1', '-timeout=15s'], {encoding:'utf8',env:{...process.env,INTENT_RETRY_MODE:mode,INTENT_RETRY_RESULT:result},timeout:25000});
    assert.equal(proc.status, 0, `TestIntentRetryCapture: go test ./executor/claudecode -run ^TestIntentRetryCapture$: ${proc.error || ''}\n${proc.stdout}${proc.stderr}`);
    assert.ok(fs.existsSync(result), 'TestIntentRetryCapture absent/skipped/zero runs: go test ./executor/claudecode produced no result');
    return JSON.parse(fs.readFileSync(result,'utf8'));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
module.exports={run,verify};
if(require.main===module) {
 const good={requests:2,success:true,matches:true,retries:1,retryLinesValid:true,partialCount:0,lockReleased:true,lockHeld:true,pausesChecked:1,source:true,http503:true,attempts3:true,mismatch:true,interrupt:true,prompt:true};
 if(process.argv[2]==='good') {verify(good,good); console.log('observer accepted');}
 else if(process.argv[2]==='bad') {
  for(const key of Object.keys(good)) {
   const bad={...good,[key]:typeof good[key]==='boolean'?!good[key]:good[key]+1};
   let rejected=false;try{verify(bad,good)}catch{rejected=true}
   if(!rejected) {console.log('observer missed '+key);process.exit(0)}
  }
  console.log('observer rejected all mutations');process.exitCode=1;
 }
}
