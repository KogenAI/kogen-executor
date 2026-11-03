// Go source is compiled only in an isolated copy by the acceptance step.
module.exports = function () {/*
package claudecode
import (
 "bytes"
 "context"
 "encoding/json"
 "fmt"
 "net/http"
 "net/http/httptest"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
 "syscall"
 "testing"
 "time"
)
func TestStallAcceptanceWorker(t *testing.T) {
 if os.Getenv("STALL_WORKER") != "1" { return }
 ctx := context.Background()
 var cancel context.CancelFunc
 mode := os.Getenv("STALL_MODE")
 if mode == "cancel" { ctx, cancel = context.WithCancel(ctx); go func(){ time.Sleep(250*time.Millisecond); cancel() }() }
 if mode == "deadline" { ctx, cancel = context.WithTimeout(ctx,250*time.Millisecond); defer cancel() }
 err := installer(os.Getenv("STALL_HOME"),nil).ensureRuntime(ctx)
 detail := ""
 if err != nil { detail = err.Error() }
 b,_ := json.Marshal(map[string]string{"error":detail})
 if err:=os.WriteFile(os.Getenv("STALL_RESULT"),b,0600);err!=nil{t.Fatal(err)}
}
func TestStallAcceptanceDriver(t *testing.T) {
 if os.Getenv("STALL_WORKER") == "1" { return }
 mode := os.Getenv("STALL_MODE")
 home := t.TempDir()
 binary := script(Version+" (Claude Code)",filepath.Join(home,"runs"))
 started := make(chan struct{},1)
 server := func(slow bool) *httptest.Server {
  return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
   if strings.HasSuffix(r.URL.Path,"manifest.json") { fmt.Fprintf(w,`{"platforms":{"linux-x64":{"checksum":%q,"size":%d}}}`,sum(binary),len(binary)); return }
   w.Header().Set("Content-Length",fmt.Sprint(len(binary)))
   if slow {
    if mode == "slow" {
     for i:=0;i<len(binary);i+=8 { end:=i+8; if end>len(binary){end=len(binary)}; w.Write(binary[i:end]); w.(http.Flusher).Flush(); select {case <-r.Context().Done(): return; case <-time.After(100*time.Millisecond):} }; return
    }
    w.Write(binary[:len(binary)/2]); w.(http.Flusher).Flush(); select {case started<-struct{}{}:default:}; <-r.Context().Done(); return
   }
   w.Write(binary)
  }))
 }
 bad:=server(true); defer bad.Close()
 good:=server(false); defer good.Close()
 exe,_:=os.Executable()
 type child struct { cmd *exec.Cmd; result string; stderr *bytes.Buffer; done chan error }
 launch:=func(origin,which string)*child{
  result:=filepath.Join(t.TempDir(),"result.json")
  c:=&child{result:result,stderr:&bytes.Buffer{},done:make(chan error,1)}
  c.cmd=exec.Command(exe,"-test.run=^TestStallAcceptanceWorker$")
  env:=[]string{}
  for _,v:=range os.Environ(){if !strings.HasPrefix(v,SeamEnv+"=") && !strings.HasPrefix(v,"STALL_"){env=append(env,v)}}
  c.cmd.Env=append(env,"STALL_WORKER=1","STALL_MODE="+which,"STALL_HOME="+home,"STALL_RESULT="+result,SeamEnv+"="+origin)
  c.cmd.Stderr=c.stderr
  if err:=c.cmd.Start();err!=nil{t.Fatal(err)}
  go func(){c.done<-c.cmd.Wait()}()
  return c
 }
 first:=launch(bad.URL,mode)
 if mode!="slow" { select{case <-started:case <-time.After(5*time.Second): first.cmd.Process.Kill();<-first.done;t.Fatal("body never started")} }
 var second *child
 if mode=="handoff" {second=launch(good.URL,"healthy")}
 wait:=func(c *child)(string,bool){
  select{case err:=<-c.done: if err!=nil{t.Fatalf("worker failed: %v",err)};case <-time.After(5*time.Second):c.cmd.Process.Kill();<-c.done;return "watchdog",false}
  b,err:=os.ReadFile(c.result);if err!=nil{t.Fatal(err)}
  var m map[string]string;if err:=json.Unmarshal(b,&m);err!=nil{t.Fatal(err)};return m["error"],true
 }
 begin:=time.Now()
 detail,finished:=wait(first)
 elapsed:=time.Since(begin).Milliseconds()
 secondDetail:="";secondDone:=true;notice:=0
 if second!=nil {secondDetail,secondDone=wait(second);notice=strings.Count(second.stderr.String(),"kogen: another Claude Code installation is in progress; waiting\n")}
 partial,_:=filepath.Glob(filepath.Join(Root(home),".partial-*"))
 lock,err:=os.OpenFile(filepath.Join(Root(home),"install.lock"),os.O_RDWR,0600)
 lockFree:=false
 if err==nil {lockFree=syscall.Flock(int(lock.Fd()),syscall.LOCK_EX|syscall.LOCK_NB)==nil;lock.Close()}
 installed,_:=runtimeUsable(home)
 report:=map[string]any{"mode":mode,"error":detail,"finished":finished,"elapsed":elapsed,"partials":len(partial),"lockFree":lockFree,"installed":installed,"source":strings.Contains(detail,bad.URL+"/"+Version+"/linux-x64/claude"),"secondError":secondDetail,"secondDone":secondDone,"notices":notice}
 b,_:=json.Marshal(report);if err:=os.WriteFile(os.Getenv("STALL_REPORT"),b,0600);err!=nil{t.Fatal(err)}
}
*/}.toString().split('/*')[1].split('*/')[0];
