const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const golden = 'contract/testdata/loop_knobs_golden.json';
function run(dir, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GOFLAGS: '-trimpath' } });
  assert.ifError(r.error);
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}
function ok(dir, cmd, args) {
  const r = run(dir, cmd, args);
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}: ${r.output}`);
}
function observe(dir) {
  const target = path.join(dir, golden);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.writeFileSync(target, '{}\n');
  const initial = fs.readFileSync(target);
  ok(dir, 'go', ['test', './contract/...']);
  assert.deepEqual(fs.readFileSync(target), initial, 'plain contract gate rewrote golden');
  ok(dir, 'go', ['test', './contract/...', '-update']);
  assert.deepEqual(fs.readFileSync(target), initial, 'golden differs from unchanged production rendering');
  const defs = path.join(dir, 'agent/defs.go');
  const source = fs.readFileSync(defs, 'utf8');
  assert.equal(source.split('return out').length, 2, 'agent/defs.go mutation anchor changed');
  fs.writeFileSync(defs, source.replace('return out', 'if len(out) > 0 { out[0]["description"] = "wire drift sentinel" }; return out'));
  ok(dir, 'go', ['test', './contract/...', '-run', '^$']);
  const drift = run(dir, 'go', ['test', './contract/...']);
  assert.notEqual(drift.status, 0, `contract gate accepted tool-description drift: ${drift.output}`);
  assert.deepEqual(fs.readFileSync(target), initial, 'drift failure rewrote golden');
}
function scratch() { return fs.mkdtempSync(path.join(os.tmpdir(), 'wire-goldens-')); }
function constraints() {
  const files = [];
  function walk(rel) {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const f = rel ? `${rel}/${e.name}` : e.name;
      if (['.git', '.kogen', 'features', 'contract'].includes(f)) continue;
      if (e.isDirectory()) walk(f);
      else if (f.endsWith('.go') && !f.endsWith('_test.go')) files.push(f);
    }
  }
  walk(''); files.push('go.mod', 'go.sum');
  const h = crypto.createHash('sha256');
  for (const f of files.sort()) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); h.update('\0'); }
  assert.equal(h.digest('hex'), 'c83357b01ab89d4a27e8238811f4e2617e8a767169cadfd4323a5ab799cd17f4', 'production Go sources and dependency manifests must match unchanged main; no CLI or timeout change');
}
function actual() {
  constraints();
  const dir = scratch();
  try {
    for (const name of ['agent', 'core', 'executor', 'thinking', 'testproc', 'internal', 'contract', 'go.mod', 'go.sum']) {
      fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
    }
    observe(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function control(bad) {
  const dir = scratch();
  const write = (p, text) => { const f = path.join(dir, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  try {
    write('go.mod', 'module fixture\n\ngo 1.27.2\n');
    write('agent/defs.go', 'package agent\nfunc Defs() []map[string]any { out := []map[string]any{{"description":"original"}}; return out }\n');
    write(golden, 'original');
    write('contract/wire_test.go', `package contract\nimport("testing";"flag";"os";"fixture/agent")\nvar update=flag.Bool("update",false,"")\nfunc TestWire(t *testing.T){ got:=agent.Defs()[0]["description"].(string); if *update { os.WriteFile("testdata/loop_knobs_golden.json",[]byte(got),0600); return }; want,_:=os.ReadFile("testdata/loop_knobs_golden.json"); if ${bad ? 'false && ' : ''}got!=string(want){t.Fatal("wire drift")} }\n`);
    observe(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
if (require.main === module) {
  try { control(process.argv[2] === 'bad'); console.log('observer accepted'); }
  catch (e) { console.log('observer rejected'); process.exitCode = 1; }
} else {
  const { Then } = require('@cucumber/cucumber');
  Then('k-exec-contract-wire-goldens: the executor gate rejects drift and preserves baseline golden bytes', { timeout: 120000 }, actual);
  Then('k-exec-contract-wire-goldens: production CLI dependencies and timeouts are unchanged', constraints);
}
