'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
function compare(actual, expected) { assert.deepStrictEqual(actual, expected); }
const source = `package claudecode
import ("encoding/json"; "fmt"; "os"; "testing")
func TestCostGapCapture(t *testing.T) {
 var rounds []struct { Total *float64 \`json:"total"\`; Failed bool \`json:"failed"\`; Tokens string \`json:"tokens"\` }
 if err := json.Unmarshal([]byte(os.Getenv("COST_GAP_ROUNDS")), &rounds); err != nil { t.Fatal(err) }
 s := &session{}
 out := []map[string]any{}
 for _, r := range rounds {
  res := map[string]any{}
  if r.Total != nil { res["total_cost_usd"] = json.Number(fmt.Sprint(*r.Total)) }
  switch r.Tokens {
  case "complete": res["usage"] = map[string]any{"input_tokens":json.Number("1"),"cache_read_input_tokens":json.Number("2"),"cache_creation_input_tokens":json.Number("3"),"output_tokens":json.Number("4")}
  case "partial": res["usage"] = map[string]any{"output_tokens":json.Number("4")}
  }
  var ev map[string]any
  if r.Failed {
   event := map[string]any{}
   rr := &roundRun{s:s, model:"m", result:res}
   rr.addResult(event)
   if u, ok := event["usage"].(map[string]any); ok { ev = u } else { ev = map[string]any{} }
  } else { ev = usageEvent(s.mapUsage(res,"m")) }
  out = append(out, map[string]any{"cost":ev["cost_usd"],"input":ev["input"],"cached":ev["cached"],"output":ev["output"],"reasoning":ev["reasoning"],"state":ev["state"]})
 }
 b, err := json.Marshal(out); if err != nil { t.Fatal(err) }; fmt.Println("COST_GAP="+string(b))
}
`;
function capture(rounds) {
 const file = path.join('executor','claudecode',`cost_gap_capture_${process.pid}_test.go`);
 assert.ok(!fs.existsSync(file));
 try {
  fs.writeFileSync(file, source);
  const r = spawnSync('go',['test','-count=1','-v','-run','^TestCostGapCapture$','./executor/claudecode'], {encoding:'utf8',timeout:180000,env:{...process.env,COST_GAP_ROUNDS:JSON.stringify(rounds)}});
  const text = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status,0,`TestCostGapCapture: go test ./executor/claudecode exited ${r.status}: ${text}`);
  const lines = text.split('\n').filter(l=>l.startsWith('COST_GAP='));
  assert.equal(lines.length,1,`TestCostGapCapture absent, skipped or ran zero times: go test ./executor/claudecode exited ${r.status}: ${text}`);
  return JSON.parse(lines[0].slice(9));
 } finally { fs.rmSync(file,{force:true}); }
}
if (require.main === module) {
 const good = [{cost:null,input:6,cached:2,output:4,reasoning:null,state:'complete'},{cost:0.15,input:null,cached:null,output:4,reasoning:null,state:'partial'}];
 compare(JSON.parse(JSON.stringify(good)),good);
 if (process.argv[2] === 'good') { console.log('accepted'); }
 else {
  for (const [i,key,value] of [[0,'cost',0.3],[0,'input',0],[0,'cached',0],[0,'output',0],[0,'reasoning',0],[0,'state','unknown'],[1,'cost',null]]) {
   const bad = JSON.parse(JSON.stringify(good)); bad[i][key]=value; assert.throws(()=>compare(bad,good));
  }
  console.log('rejected'); process.exitCode=1;
 }
} else {
 const {When,Then} = require('@cucumber/cucumber');
 When('k-exec-cost-baseline-gaps: mapping these rounds:',{timeout:240000},function(doc){this.costGap=capture(JSON.parse(doc));});
 Then('k-exec-cost-baseline-gaps: usage is:',function(doc){compare(this.costGap,JSON.parse(doc));});
}
