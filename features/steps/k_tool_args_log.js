'use strict';
const { Given, When, Then } = require('@cucumber/cucumber');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

// The Go driver runs one real Claude Code adapter round against its scripted fake runtime and
// prints the adapter's run-log events. It is built once per acceptance process.
let driverBin;
function driver() {
  if (!driverBin) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-tool-args-driver-'));
    process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
    const bin = path.join(dir, 'driver');
    const built = spawnSync('go', ['build', '-o', bin, './features/steps/k_tool_args_log'], { encoding: 'utf8', timeout: 170000 });
    assert.equal(built.status, 0, `go build ./features/steps/k_tool_args_log: ${built.error || ''}\n${built.stdout}${built.stderr}`);
    driverBin = bin;
  }
  return driverBin;
}

// expand turns the fixture forms {"$repeat": text, "times": n} and {"$concat": [parts]} into
// strings, everywhere in a parsed JSON value.
function expand(v) {
  if (Array.isArray(v)) return v.map(expand);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    if (keys.length === 2 && keys[0] === '$repeat' && keys[1] === 'times') return String(v.$repeat).repeat(v.times);
    if (keys.length === 1 && keys[0] === '$concat') return v.$concat.map(expand).join('');
    return Object.fromEntries(Object.keys(v).map((k) => [k, expand(v[k])]));
  }
  return v;
}

function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out); }
  return out;
}

function runRound(world, role, calls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-tool-args-calls-'));
  try {
    const callsPath = path.join(dir, 'calls.json');
    fs.writeFileSync(callsPath, JSON.stringify(calls));
    const args = ['run', role, callsPath];
    if (world.storedToken !== undefined) {
      const tokenPath = path.join(dir, 'token');
      fs.writeFileSync(tokenPath, world.storedToken);
      args.push(tokenPath);
    }
    // Only PATH, TMPDIR and the scenario's variables: the adapter's environment is the fixture's.
    const env = { PATH: process.env.PATH, ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}), ...(world.adapterEnv || {}) };
    const r = spawnSync(driver(), args, { encoding: 'utf8', env, timeout: 60000, maxBuffer: 64 << 20 });
    assert.equal(r.status, 0, `driver run ${role}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
    world.events = r.stdout.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

Given('the adapter environment has {string} set to {string}', function (name, value) {
  this.adapterEnv = { ...(this.adapterEnv || {}), [name]: value };
});

Given('the stored Claude Code token is {string}', function (token) {
  this.storedToken = token;
});

When('a {string} round makes these tool calls:', { timeout: 240000 }, function (role, doc) {
  runRound(this, role, expand(JSON.parse(doc)));
});

When(/^a "(shape|build|review)" round runs the command: (.+)$/, { timeout: 240000 }, function (role, command) {
  runRound(this, role, [{ name: 'Bash', input: { command } }]);
});

Then("the round's tool records are:", function (doc) {
  assert.ok(this.events, 'the adapter round must have run');
  const tools = this.events.filter((e) => e.event === 'executor_tool');
  assert.deepStrictEqual(tools, expand(JSON.parse(doc)));
});

Then(/^the Bash command is logged as: (.+)$/, function (logged) {
  assert.ok(this.events, 'the adapter round must have run');
  const tools = this.events.filter((e) => e.event === 'executor_tool');
  assert.equal(tools.length, 1, `one executor_tool record: ${JSON.stringify(tools)}`);
  assert.ok(tools[0].arguments && typeof tools[0].arguments === 'object', `the Bash record has an arguments object: ${JSON.stringify(tools[0])}`);
  assert.deepStrictEqual(tools[0].arguments, { command: logged });
});

Then('no run-log event contains {string}', function (secret) {
  assert.ok(this.events && this.events.length > 0, 'the adapter round must have emitted run-log events');
  for (const e of this.events) {
    for (const s of strings(e)) {
      assert.ok(!s.includes(secret), `run-log event ${e.event} contains ${JSON.stringify(secret)}`);
    }
  }
});
