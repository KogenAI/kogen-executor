'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const label = 'claude-transcripts-grow-without-bound';
const prefix = label + ': ';
const hour = 3600;
const fakeClaude = '#!/bin/sh\ncase "$1" in\n--version) echo "2.1.312 (Claude Code)";;\nauth) echo \'{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}\';;\n*) exit 1;;\nesac\n';

// The driver runs the public claudecode.Start once against a fake home and prints its error,
// its duration and every event as JSON. The retention option is set by name, so that the
// driver compiles before the option exists and reports its absence instead.
const driverSource = String.raw`package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"os"
	"reflect"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	clear(p)
	return len(p), nil
}

func main() {
	var in map[string]any
	if err := json.Unmarshal([]byte(os.Args[1]), &in); err != nil {
		panic(err)
	}
	str := func(k string) string { s, _ := in[k].(string); return s }
	events := []map[string]any{}
	out := map[string]any{"error": "", "option_error": "", "elapsed_ms": 0, "events": events}
	opts := claudecode.Options{Home: str("home"), HookCommand: []string{"/bin/true"}, Stderr: os.Stderr}
	if h, ok := in["retention_hours"].(float64); ok {
		d := time.Duration(h) * time.Hour
		f := reflect.ValueOf(&opts).Elem().FieldByName("TranscriptRetention")
		if !f.IsValid() || f.Type() != reflect.TypeOf(&d) {
			out["option_error"] = "claudecode.Options has no TranscriptRetention *time.Duration field"
			if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
				panic(err)
			}
			return
		}
		f.Set(reflect.ValueOf(&d))
	}
	if in["zero_random"] == true {
		rand.Reader = zeroReader{}
	}
	task := executor.Task{Role: executor.RoleBuild, Root: str("root"), Dir: str("dir"), Home: str("home"), Model: "claude-sonnet-5-5", Schema: json.RawMessage("{\"type\":\"object\"}")}
	begin := time.Now()
	s, err := claudecode.New(opts).Start(context.Background(), task, func(ev map[string]any) { events = append(events, ev) })
	out["elapsed_ms"] = time.Since(begin).Milliseconds()
	if err != nil {
		out["error"] = err.Error()
	}
	if s != nil {
		s.Close()
	}
	out["events"] = events
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}
`;

let driver;
function buildDriver() {
  if (driver) return driver;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), label + '-driver-'));
  process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'main.go');
  fs.writeFileSync(file, driverSource);
  const bin = path.join(dir, 'driver');
  const r = cp.spawnSync('go', ['build', '-o', bin, file], {cwd: process.cwd(), encoding: 'utf8', timeout: 240000});
  assert.equal(r.status, 0, `${label}: go build of the Start driver failed: ${r.error || ''}\n${r.stdout}${r.stderr}`);
  driver = bin;
  return bin;
}

function fixture(world) {
  if (!world.tcg) {
    world.tcg = {root: fs.mkdtempSync(path.join(os.tmpdir(), label + '-')), created: {}, ages: [], locked: [], bulk: []};
  }
  return world.tcg;
}

// abs maps a fixture path: config/... is inside Kogen's Claude Code configuration folder of
// the fake home, outside/... is a folder next to the home.
function abs(t, p) {
  const [top, ...rest] = p.split('/');
  if (top === 'config') return path.join(t.root, 'home', '.kogen', 'claude-code', 'config', ...rest);
  if (top === 'outside') return path.join(t.root, 'outside', ...rest);
  throw new Error(`${label}: fixture path ${p} must start with config/ or outside/`);
}

function addRows(t, rows) {
  for (const row of rows) {
    const p = abs(t, row.path);
    fs.mkdirSync(path.dirname(p), {recursive: true});
    switch (row.kind) {
      case 'file': {
        const data = 'x'.repeat(Number(row.bytes));
        fs.writeFileSync(p, data);
        t.created[row.path] = {kind: 'file', data};
        break;
      }
      case 'dir':
        fs.mkdirSync(p, {recursive: true});
        t.created[row.path] = {kind: 'dir'};
        break;
      case 'locked':
        assert.notEqual(process.getuid(), 0, `${label}: a read-only folder cannot make removal impossible for root; run the acceptance as an ordinary user`);
        fs.mkdirSync(p, {recursive: true});
        t.locked.push(p);
        t.created[row.path] = {kind: 'dir'};
        break;
      case 'link': {
        const target = abs(t, row.target);
        fs.symlinkSync(target, p);
        t.created[row.path] = {kind: 'link', target};
        break;
      }
      default:
        throw new Error(`${label}: unknown fixture kind ${row.kind}`);
    }
    t.ages.push([p, Number(row.hours), row.kind === 'link']);
  }
}

function addBulk(t, dir, n, bytes, hours) {
  const d = abs(t, dir);
  fs.mkdirSync(d, {recursive: true});
  const data = 'x'.repeat(bytes);
  for (let i = 0; i < n; i++) {
    const p = path.join(d, `cccccccc-0000-4000-8000-${i.toString(16).padStart(12, '0')}.jsonl`);
    fs.writeFileSync(p, data);
    t.ages.push([p, hours, false]);
  }
  t.bulk.push(dir);
}

function observe(p) {
  let st;
  try {
    st = fs.lstatSync(p);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  if (st.isSymbolicLink()) return {kind: 'link', target: fs.readlinkSync(p)};
  if (st.isDirectory()) return {kind: 'dir'};
  if (st.isFile()) return {kind: 'file', data: fs.readFileSync(p, 'utf8')};
  return {kind: 'other'};
}

function start(world, extra) {
  const t = fixture(world);
  const bin = buildDriver();
  const home = path.join(t.root, 'home');
  const claude = path.join(home, '.kogen', 'claude-code', '2.1.312', 'claude');
  fs.mkdirSync(path.dirname(claude), {recursive: true});
  fs.writeFileSync(claude, fakeClaude, {mode: 0o755});
  const checkout = path.join(t.root, 'checkout');
  fs.mkdirSync(checkout, {recursive: true});
  const now = Date.now() / 1000;
  for (const [p, hours, link] of t.ages) (link ? fs.lutimesSync : fs.utimesSync)(p, now - hours * hour, now - hours * hour);
  for (const p of t.locked) fs.chmodSync(p, 0o555);
  try {
    const input = {home, root: checkout, dir: path.join(t.root, 'artifacts'), ...extra};
    const r = cp.spawnSync(bin, [JSON.stringify(input)], {encoding: 'utf8', timeout: 120000, maxBuffer: 64 << 20});
    assert.equal(r.status, 0, `${label}: the Start driver failed: ${r.error || ''}\n${r.stdout}${r.stderr}`);
    const out = JSON.parse(r.stdout);
    const after = {};
    for (const p of Object.keys(t.created)) after[p] = observe(abs(t, p));
    const counts = {};
    for (const d of t.bulk) counts[d] = fs.readdirSync(abs(t, d)).length;
    world.obs = {
      error: out.error, option_error: out.option_error, elapsed_ms: out.elapsed_ms,
      started: out.events.filter(e => e.event === 'executor_started'),
      created: t.created, after, counts,
    };
  } finally {
    for (const p of t.locked) if (fs.existsSync(p)) fs.chmodSync(p, 0o755);
    fs.rmSync(t.root, {recursive: true, force: true});
    world.tcg = undefined;
  }
}

function succeeded(o) {
  assert.equal(o.option_error, '', `${label}: ${o.option_error}`);
  assert.equal(o.error, '', `${label}: Start failed: ${o.error}`);
  assert.equal(o.started.length, 1, `${label}: ${o.started.length} executor_started events, want 1`);
}
function reports(o, want) {
  succeeded(o);
  const ev = o.started[0];
  assert.ok(Object.hasOwn(ev, 'transcripts'), `${label}: executor_started has no transcripts report; its keys are ${Object.keys(ev).sort().join(', ')}`);
  assert.deepEqual(ev.transcripts, want, `${label}: executor_started transcripts report`);
}
function noReport(o) {
  succeeded(o);
  assert.equal(Object.hasOwn(o.started[0], 'transcripts'), false, `${label}: executor_started has a transcripts report: ${JSON.stringify(o.started[0].transcripts)}`);
}
function remain(o, paths) {
  succeeded(o);
  for (const p of paths) {
    assert.ok(Object.hasOwn(o.created, p), `${label}: ${p} is not a fixture path`);
    assert.deepEqual(o.after[p], o.created[p], `${label}: ${p} was removed or changed`);
  }
}
function gone(o, paths) {
  succeeded(o);
  for (const p of paths) {
    assert.ok(Object.hasOwn(o.created, p), `${label}: ${p} is not a fixture path`);
    assert.equal(o.after[p], null, `${label}: ${p} is still present`);
  }
}
function holds(o, dir, n) {
  succeeded(o);
  assert.equal(o.counts[dir], n, `${label}: entries left in ${dir}`);
}
function within(o, ms) {
  succeeded(o);
  assert.ok(typeof o.elapsed_ms === 'number' && o.elapsed_ms <= ms, `${label}: Start took ${o.elapsed_ms} ms, more than ${ms} ms`);
}
function sessionIs(o, id) {
  succeeded(o);
  assert.equal(o.started[0].session_id, id, `${label}: executor_started session_id`);
}

// controls runs every observer above on a known-good observation and on known-bad mutations.
function controls(bad) {
  const own = '00000000-0000-4000-8000-000000000000';
  const created = {
    'config/projects/-a/11111111-1111-4111-8111-111111111111.jsonl': {kind: 'file', data: 'xx'},
    'config/projects/-b/22222222-2222-4222-8222-222222222222.jsonl': {kind: 'file', data: 'xxx'},
    'config/projects/-l': {kind: 'link', target: '/tmp/x/outside/wd'},
    'config/plugins': {kind: 'dir'},
  };
  const [kept, removed, link, plugins] = Object.keys(created);
  const want = {removed: 1, removed_bytes: 3, kept: 1, remove_failed: 0, bound_reached: false};
  const good = {
    error: '', option_error: '', elapsed_ms: 40,
    started: [{event: 'executor_started', session_id: own, transcripts: {...want}}],
    created, after: {...structuredClone(created), [removed]: null},
    counts: {'config/projects/-bulk': 51},
  };
  const quiet = structuredClone(good);
  delete quiet.started[0].transcripts;
  const checks = [
    [succeeded, good], [reports, good, want], [noReport, quiet],
    [remain, good, [kept, link, plugins]], [gone, good, [removed]],
    [holds, good, 'config/projects/-bulk', 51], [within, good, 15000], [sessionIs, good, own],
  ];
  for (const [check, o, ...args] of checks) check(structuredClone(o), ...args);
  if (!bad) {
    console.log('observer good');
    return;
  }
  const cases = [
    [succeeded, good, [], o => { o.error = 'executor unavailable: no'; }],
    [succeeded, good, [], o => { o.option_error = 'claudecode.Options has no TranscriptRetention *time.Duration field'; }],
    [succeeded, good, [], o => { o.started = []; }],
    [succeeded, good, [], o => { o.started.push(o.started[0]); }],
    [reports, good, [want], o => { o.started[0].transcripts.removed = 2; }],
    [reports, good, [want], o => { o.started[0].transcripts.removed_bytes = 4; }],
    [reports, good, [want], o => { o.started[0].transcripts.kept = 0; }],
    [reports, good, [want], o => { o.started[0].transcripts.remove_failed = 1; }],
    [reports, good, [want], o => { o.started[0].transcripts.bound_reached = true; }],
    [reports, good, [want], o => { o.started[0].transcripts.bound_reached = 'false'; }],
    [reports, good, [want], o => { o.started[0].transcripts.extra = 0; }],
    [reports, good, [want], o => { delete o.started[0].transcripts.kept; }],
    [reports, good, [want], o => { delete o.started[0].transcripts; }],
    [reports, good, [want], o => { o.error = 'executor failed: no'; }],
    [noReport, good, [], () => {}],
    [noReport, quiet, [], o => { o.started[0].transcripts = {}; }],
    [noReport, quiet, [], o => { o.option_error = 'missing'; }],
    [remain, good, [[kept]], o => { o.after[kept] = null; }],
    [remain, good, [[kept]], o => { o.after[kept].data = 'x'; }],
    [remain, good, [[link]], o => { o.after[link] = {kind: 'dir'}; }],
    [remain, good, [[link]], o => { o.after[link] = null; }],
    [remain, good, [[plugins]], o => { o.after[plugins] = null; }],
    [remain, good, [['config/settings.json']], () => {}],
    [gone, good, [[removed]], o => { o.after[removed] = structuredClone(o.created[removed]); }],
    [gone, good, [['config/other.jsonl']], () => {}],
    [gone, good, [[removed]], o => { o.error = 'executor failed: no'; }],
    [holds, good, ['config/projects/-bulk', 51], o => { o.counts['config/projects/-bulk'] = 10050; }],
    [holds, good, ['config/projects/-bulk', 51], o => { o.counts = {}; }],
    [within, good, [15000], o => { o.elapsed_ms = 15001; }],
    [within, good, [15000], o => { delete o.elapsed_ms; }],
    [sessionIs, good, [own], o => { o.started[0].session_id = '11111111-1111-4111-8111-111111111111'; }],
  ];
  for (const [check, base, args, mutate] of cases) {
    const o = structuredClone(base);
    mutate(o);
    let threw = false;
    try {
      check(o, ...args);
    } catch (_) {
      threw = true;
    }
    assert.ok(threw, `${label}: mutation not rejected by ${check.name}: ${mutate}`);
  }
  console.log('observer bad rejected');
  process.exitCode = 1;
}

if (require.main === module) {
  controls(process.argv[2] === 'bad');
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  Given(prefix + 'a fake Kogen Claude Code home with:', function(table) {
    addRows(fixture(this), table.hashes());
  });
  Given(prefix + 'the configuration folder {string} holds {int} session transcripts of {int} bytes aged {int} hours', {timeout: 120000}, function(dir, n, bytes, hours) {
    addBulk(fixture(this), dir, n, bytes, hours);
  });
  When(prefix + 'Start runs with the default retention', {timeout: 300000}, function() {
    start(this, {});
  });
  When(prefix + 'Start runs with the retention option set to {int} hours', {timeout: 300000}, function(hours) {
    start(this, {retention_hours: hours});
  });
  When(prefix + 'Start runs with the default retention and all-zero session randomness', {timeout: 300000}, function() {
    start(this, {zero_random: true});
  });
  Then(prefix + 'Start succeeds', function() { succeeded(this.obs); });
  Then(prefix + 'the start event reports transcripts:', function(doc) { reports(this.obs, JSON.parse(doc)); });
  Then(prefix + 'the start event has no transcripts report', function() { noReport(this.obs); });
  Then(prefix + 'these paths remain unchanged:', function(doc) { remain(this.obs, JSON.parse(doc)); });
  Then(prefix + 'these paths are gone:', function(doc) { gone(this.obs, JSON.parse(doc)); });
  Then(prefix + 'the folder {string} holds {int} entries', function(dir, n) { holds(this.obs, dir, n); });
  Then(prefix + 'Start returned within {int} milliseconds', function(ms) { within(this.obs, ms); });
  Then(prefix + 'the start event session id is {string}', function(id) { sessionIs(this.obs, id); });
}
