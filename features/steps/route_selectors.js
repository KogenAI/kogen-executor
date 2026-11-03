'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
function verify(env, keys, required) {
  for (const key of keys) assert.equal(env.filter(v => v.startsWith(key + '=')).length, 0, key);
  for (const entry of required) {
    const key = entry.split('=')[0];
    assert.deepEqual(env.filter(v => v.startsWith(key + '=')), [entry], key);
  }
}
function capture(keys) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.route-capture-'));
  try {
    for (const name of fs.readdirSync('executor/claudecode').filter(n => n.endsWith('.go'))) fs.copyFileSync(path.join('executor/claudecode', name), path.join(dir, name));
    fs.writeFileSync(path.join(dir, 'route_capture_test.go'), `package claudecode
import("context";"encoding/json";"os";"testing";"github.com/KogenAI/kogen-executor/executor")
func TestRouteCapture(t *testing.T) {
 var keys []string
 if err := json.Unmarshal([]byte(os.Getenv("ROUTE_KEYS")), &keys); err != nil {t.Fatal(err)}
 base := []string{"HTTPS_PROXY=proxy","NO_PROXY=local","AWS_REGION=region","PATH=/bin","CLAUDE_CONFIG_DIR=old","CLAUDE_CONFIG_DIR=older","HOME=old","HOME=older","DISABLE_UPDATES=0","CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=0","CLAUDE_CODE_DISABLE_AUTO_MEMORY=0"}
 for _, k := range keys {base=append(base,k+"=inherited")}
 direct := childEnv(base,"/h","","/cfg")
 h := newHarness(t, fakeConfig{Script:oneRound(finishRound)})
 h.task.Model=""
 s,err:=h.start(h.f.options("ANTHROPIC_MODEL=x","ANTHROPIC_CUSTOM_HEADERS=h")); if err!=nil {t.Fatal(err)}; defer s.Close()
 if _,err=s.Round(context.Background(),executor.Input{});err!=nil {t.Fatal(err)}
 b,err:=json.Marshal(map[string][]string{"direct":direct,"round":h.f.env(1)});if err!=nil {t.Fatal(err)}
 if err=os.WriteFile(os.Getenv("ROUTE_OUTPUT"),b,0600);err!=nil {t.Fatal(err)}
}
`);
    const output = path.join(dir, 'capture.json');
    const r = spawnSync('go', ['test', '-count=1', '-run', '^TestRouteCapture$', './' + path.basename(dir)], { encoding: 'utf8', timeout: 180000, env: { ...process.env, ROUTE_KEYS: JSON.stringify(keys), ROUTE_OUTPUT: output } });
    assert.equal(r.status, 0, `TestRouteCapture: go test capture exited ${r.status}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
    assert.ok(fs.existsSync(output), `TestRouteCapture absent, skipped or ran zero times: go test capture exited ${r.status}\n${r.stdout}${r.stderr}`);
    return JSON.parse(fs.readFileSync(output, 'utf8'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
if (require.main === module) {
  const keys = ['ANTHROPIC_MODEL', 'ANTHROPIC_CUSTOM_HEADERS'];
  const required = ['PATH=/bin', 'HOME=/h', 'CLAUDE_CONFIG_DIR=/cfg', 'DISABLE_UPDATES=1'];
  verify(required, keys, required);
  if (process.argv[2] === 'good') console.log('accepted');
  else {
    for (const key of keys) assert.throws(() => verify([...required, key + '=x'], keys, required));
    for (const entry of required) {
      assert.throws(() => verify(required.filter(v => v !== entry), keys, required));
      assert.throws(() => verify([...required, entry], keys, required));
      assert.throws(() => verify(required.map(v => v === entry ? entry + 'wrong' : v), keys, required));
    }
    console.log('rejected'); process.exitCode = 1;
  }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  When('the route selector environment is captured for:', { timeout: 240000 }, function(doc) { this.routeKeys = JSON.parse(doc); this.routeCapture = capture(this.routeKeys); });
  Then('the route selector capture preserves exactly these required entries and excludes all supplied selectors:', function(doc) { verify(this.routeCapture.direct, this.routeKeys, JSON.parse(doc)); });
  Then('the round environment excludes parent selectors {string} and {string}', function(a,b) { verify(this.routeCapture.round, [a,b], []); });
}
