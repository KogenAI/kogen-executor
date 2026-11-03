'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const TEST = 'TestStreamProfileCapture';
const TIMING = ['wall_ms', 'init_ms', 'max_line_gap_ms', 'ignored_events'];

// capture runs the submitted capture test once in a temporary package under the module,
// against the real adapter and a fake claude script with real sleeps.
function capture(rounds) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.stream-profile-capture-'));
  const command = `go test -count=1 -v -run ^${TEST}$ ./${path.basename(dir)}`;
  try {
    fs.copyFileSync('features/steps/stream_profile_capture_test.go.txt', path.join(dir, 'stream_profile_capture_test.go'));
    const r = spawnSync('go', ['test', '-count=1', '-v', '-run', `^${TEST}$`, './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 240000, env: { ...process.env, STREAM_PROFILE_ROUNDS: JSON.stringify(rounds) }
    });
    assert.equal(r.status, 0, `${TEST}: ${command}; outcome ${r.status}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
    const payloads = r.stdout.split('\n').filter(l => l.startsWith('STREAM_PROFILE_CAPTURE='));
    assert.equal(payloads.length, 1, `${TEST} absent, skipped or ran zero times: ${command}; outcome ${r.status}\n${r.stdout}${r.stderr}`);
    const rows = JSON.parse(payloads[0].slice('STREAM_PROFILE_CAPTURE='.length));
    assert.deepEqual(rows.map(x => x.name), rounds.map(x => x.name), `${TEST} must capture every round: ${command}`);
    return rows;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function row(rows, name) {
  assert.ok(rows, 'the stream-profile rounds must have run');
  const r = rows.find(x => x.name === name);
  assert.ok(r, `no captured round ${name}`);
  return r;
}
function terminal(r) {
  assert.equal(r.events.length, 1, `${r.name}: exactly one terminal event, got ${JSON.stringify(r.events)}`);
  return r.events[0];
}
function outcome(r, event, ending, reason) {
  const e = terminal(r);
  assert.equal(e.event, event, `${r.name}: terminal event ${JSON.stringify(e)}; detail ${r.detail}`);
  assert.equal(r.ending, ending, `${r.name}: ending; detail ${r.detail}`);
  assert.equal(r.reason, reason, `${r.name}: error reason; detail ${r.detail}`);
}
function between(r, key, lo, hi) {
  const e = terminal(r);
  assert.ok(Object.hasOwn(e, key), `${r.name}: ${e.event} has no ${key}: ${JSON.stringify(e)}`);
  const v = e[key];
  assert.ok(Number.isInteger(v), `${r.name}: ${key} must be an integer number of ms, got ${JSON.stringify(v)}`);
  assert.ok(v >= lo && v <= hi, `${r.name}: ${key} ${v} outside [${lo}, ${hi}]`);
}
function absent(r, key) {
  const e = terminal(r);
  assert.ok(!Object.hasOwn(e, key), `${r.name}: ${e.event} must not carry ${key}: ${JSON.stringify(e)}`);
}
function ignored(r, want) {
  const e = terminal(r);
  assert.ok(Object.hasOwn(e, 'ignored_events'), `${r.name}: ${e.event} has no ignored_events: ${JSON.stringify(e)}`);
  assert.deepStrictEqual(e.ignored_events, want, `${r.name}: ignored_events`);
}
// same compares two rounds' results and terminal events apart from timing, ignored-event
// and session-specific fields.
function same(a, b) {
  const norm = r => {
    const e = { ...terminal(r) };
    for (const k of [...TIMING, 'session_id']) delete e[k];
    return { ending: r.ending, claim: r.claim, reason: r.reason, event: e };
  };
  assert.deepStrictEqual(norm(a), norm(b), `${a.name} and ${b.name} must have the same outcome`);
}

function notices(n) {
  const stream = ['init'];
  for (let i = 1; i <= n; i++) stream.push({ type: 'system', subtype: 'notice_' + String(i).padStart(2, '0') });
  stream.push({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: '@SID@', num_turns: 1, terminal_reason: 'completed' });
  return stream;
}

if (require.main !== module) {
  const { Given, When, Then } = require('@cucumber/cucumber');
  const add = (world, name, stream, exit) => { (world.profileRounds ||= []).push({ name, stream, exit }); };
  Given('the stream-profile round {string} streams:', function (name, doc) { add(this, name, JSON.parse(doc), 0); });
  Given('the stream-profile round {string} streams these items and exits with status {int}:', function (name, exit, doc) { add(this, name, JSON.parse(doc), exit); });
  Given('the stream-profile round {string} streams init, {int} system lines with subtypes notice_01 upward, and a success result', function (name, n) { add(this, name, notices(n), 0); });
  // Every scenario shares the Background rounds: run them once per acceptance run.
  const runs = new Map();
  When('the stream-profile rounds run', { timeout: 300000 }, function () {
    const key = JSON.stringify(this.profileRounds);
    if (!runs.has(key)) runs.set(key, capture(this.profileRounds));
    this.profileRows = structuredClone(runs.get(key));
  });
  Then('the stream-profile round {string} emits {string} with ending {string} and reason {string}', function (name, event, ending, reason) { outcome(row(this.profileRows, name), event, ending, reason); });
  Then('the stream-profile round {string} reports {string} from {int} to {int}', function (name, key, lo, hi) { between(row(this.profileRows, name), key, lo, hi); });
  Then('the stream-profile round {string} does not report {string}', function (name, key) { absent(row(this.profileRows, name), key); });
  Then('the stream-profile round {string} reports ignored events:', function (name, doc) { ignored(row(this.profileRows, name), JSON.parse(doc)); });
  Then('the stream-profile rounds {string} and {string} have the same outcome', function (a, b) { same(row(this.profileRows, a), row(this.profileRows, b)); });
} else {
  // Observer control: capture real rounds through the unchanged adapter, supply only the new
  // fields to make the known-good fixture, then check that each assertion rejects a mutation.
  const result = { type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: '@SID@', num_turns: 1, terminal_reason: 'completed' };
  const rounds = [
    { name: 'plain', stream: ['init', result], exit: 0 },
    { name: 'notices', stream: ['init', { type: 'system', subtype: 'other_notice' }, { type: 'progress_tick' }, result], exit: 0 },
    { name: 'noinit', stream: [{ type: 'system', subtype: 'hook_started' }], exit: 0 },
  ];
  const rows = capture(rounds);
  const supply = rs => {
    for (const r of rs) {
      const e = r.events[0];
      Object.assign(e, { wall_ms: 1200, max_line_gap_ms: 40 });
      if (r.name !== 'noinit') e.init_ms = 30;
      if (r.name === 'notices') e.ignored_events = { 'system/other_notice': 1, progress_tick: 1 };
    }
    return rs;
  };
  const checks = rs => {
    const [plain, notices, noinit] = ['plain', 'notices', 'noinit'].map(n => row(rs, n));
    outcome(plain, 'executor_round_ended', 'finish', '');
    outcome(noinit, 'executor_round_failed', '', 'protocol');
    between(plain, 'wall_ms', 1000, 2000);
    between(noinit, 'max_line_gap_ms', 0, 100);
    between(notices, 'init_ms', 0, 100);
    absent(noinit, 'init_ms');
    ignored(notices, { 'system/other_notice': 1, progress_tick: 1 });
    same(plain, notices);
  };
  const good = supply(rows);
  checks(good);
  if (process.argv[2] === 'good') console.log('observer accepted');
  else {
    const mutations = [
      rs => { rs[0].events = []; },
      rs => { rs[0].events[0].event = 'executor_round_failed'; },
      rs => { rs[2].reason = 'failed'; },
      rs => { rs[0].events[0].wall_ms = 999; },
      rs => { rs[0].events[0].wall_ms = 1.5e3 + 0.5; },
      rs => { delete rs[0].events[0].wall_ms; },
      rs => { rs[2].events[0].max_line_gap_ms = 101; },
      rs => { delete rs[1].events[0].init_ms; },
      rs => { rs[2].events[0].init_ms = 0; },
      rs => { rs[1].events[0].ignored_events = { 'system/other_notice': 2, progress_tick: 1 }; },
      rs => { rs[1].events[0].ignored_events['system/hook_started'] = 1; },
      rs => { delete rs[1].events[0].ignored_events; },
      rs => { rs[1].claim = 'other'; },
      rs => { rs[1].events[0].num_turns = 9; },
    ];
    for (const m of mutations) {
      const copy = structuredClone(good);
      m(copy);
      assert.throws(() => checks(copy), undefined, `mutation not rejected: ${m}`);
    }
    console.log('observer rejected mutations');
    process.exitCode = 1;
  }
}
