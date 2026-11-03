const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
function observe(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('mismatch');
}
if (require.main === module) {
  try {
    observe({mode:'775',link:true,ready:true}, {mode:process.argv[2] === 'good' ? '775' : '700',link:true,ready:true});
  } catch (_) { process.stderr.write('mismatch\n'); process.exitCode = 1; }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('runtime preparation uses a {string} config directory', function(kind) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'config-permissions-'));
    try {
      const home = path.join(tmp, 'home');
      const root = path.join(home,'.kogen','claude-code');
      const config = path.join(root,'config');
      const target = path.join(home,'.claude-bench');
      fs.mkdirSync(root,{recursive:true});
      if (kind === 'linked') {
        fs.mkdirSync(target); fs.chmodSync(target,0o775); fs.symlinkSync(target,config);
      } else if (kind === 'plain') {
        fs.mkdirSync(config); fs.chmodSync(config,0o775);
      }
      const source = `package main
import("context";"fmt";"os";"path/filepath";"strings"; cc "github.com/KogenAI/kogen-executor/executor/claudecode"; ex "github.com/KogenAI/kogen-executor/executor")
func main(){h:=os.Args[1]; p:=cc.RuntimePath(h); if e:=os.MkdirAll(filepath.Dir(p),0700);e!=nil{panic(e)}; if e:=os.WriteFile(p,[]byte("#!/bin/sh\\necho config-permission-sentinel\\n"),0755);e!=nil{panic(e)}; a:=cc.New(cc.Options{Home:h,HookCommand:[]string{"unused"}}); _,e:=a.Start(context.Background(),ex.Task{},nil); if e==nil || !strings.Contains(e.Error(),"config-permission-sentinel"){panic(fmt.Sprint("did not reach pinned-version check: ",e))}}
`;
      const file = path.join(tmp,'main.go'); fs.writeFileSync(file,source);
      const binary = path.join(tmp,'driver');
      const build = cp.spawnSync('go',['build','-o',binary,file],{encoding:'utf8',timeout:120000});
      if (build.status !== 0) throw new Error(`go build failed: ${build.error || ''}\n${build.stdout}\n${build.stderr}`);
      const r = cp.spawnSync(binary,[home],{encoding:'utf8',timeout:120000});
      if (r.status !== 0) throw new Error(`driver failed: ${r.error || ''}\n${r.stdout}\n${r.stderr}`);
      this.configObservation = {mode:(fs.statSync(config).mode & 0o777).toString(8),link:fs.lstatSync(config).isSymbolicLink(),ready:true};
    } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
  });
  Then('config permissions are {string} and the config link is {string}', function(mode,link) {
    observe(this.configObservation,{mode,link:link==='true',ready:true});
  });
}
