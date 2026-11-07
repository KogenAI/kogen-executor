'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const TEST = 'TestFailedUsageCapture';
const PREFIX = 'FAILED_USAGE_CAPTURE=';

// capture runs the real adapter Round on the contract fake `claude` for each round's result
// lines and returns every terminal event as its exact JSON line (session id written as @SID@).
function capture(rounds) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.failed-usage-capture-'));
  const pkg = './' + path.basename(dir);
  const command = `go test -count=1 -v -run ^${TEST}$ ${pkg}`;
  try {
    for (const name of fs.readdirSync('contract').filter(n => n.endsWith('.go'))) {
      fs.copyFileSync(path.join('contract', name), path.join(dir, name));
    }
    fs.copyFileSync('features/steps/failed_round_usage_capture_test.go.txt', path.join(dir, 'failed_round_usage_capture_test.go'));
    const r = spawnSync('go', ['test', '-count=1', '-v', '-run', `^${TEST}$`, pkg], {
      encoding: 'utf8', timeout: 180000, env: { ...process.env, FAILED_USAGE_ROUNDS: JSON.stringify(rounds) }
    });
    const out = `${r.stdout}${r.stderr}`;
    assert.equal(r.status, 0, `${TEST}: ${command} exited ${r.status} ${r.error || ''}\n${out}`);
    assert.ok(r.stdout.includes(`--- PASS: ${TEST} (`), `${TEST} was absent, skipped or ran zero times: ${command} exited ${r.status}\n${out}`);
    return r.stdout.split('\n').filter(l => l.startsWith(PREFIX)).map(l => l.slice(PREFIX.length));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function lineRounds(rounds) { return rounds.map(lines => lines.map(v => JSON.stringify(v))); }
function compareEvents(lines, expected) {
  assert.deepStrictEqual(lines.map(l => JSON.parse(l)), expected, `terminal events:\n${lines.join('\n')}`);
}
function compareLines(lines, expected) { assert.deepStrictEqual(lines, expected); }

if (require.main !== module) {
  const { When, Then } = require('@cucumber/cucumber');
  When('the failed-usage adapter runs these rounds:', { timeout: 240000 }, function (doc) {
    this.failedUsageLines = capture(lineRounds(JSON.parse(doc)));
  });
  Then('the failed-usage terminal events are:', function (doc) {
    compareEvents(this.failedUsageLines, JSON.parse(doc));
  });
  Then('the failed-usage terminal event lines are exactly:', function (doc) {
    compareLines(this.failedUsageLines, doc.split('\n'));
  });
} else {
  // Observer controls on the unchanged adapter: the real captured events, with only the
  // requested failed-round keys supplied, are the known-good input; mutations are known-bad.
  const errorResult = { type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'api_error', result: 'boom', num_turns: 7, total_cost_usd: 0.25, usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 5, output_tokens: 7 }, session_id: '@SID@' };
  const success = { type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: '@SID@', num_turns: 3, terminal_reason: 'completed', total_cost_usd: 0.1, usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4 } };
  const failedExpected = [{ event: 'executor_round_failed', role: 'build', round: 1, reason: 'failed', detail: 'Claude Code reported an error result: subtype "error_during_execution", terminal reason "api_error"', deadline_remaining_ms: null, usage: { state: 'complete', source: 'harness', input: 35, cached: 20, output: 7, reasoning: null, cost_usd: 0.25, model: 'claude-sonnet-5-5' }, num_turns: 7, subtype: 'error_during_execution', terminal_reason: 'api_error' }];
  const noResultExpected = [{ event: 'executor_round_failed', role: 'build', round: 1, reason: 'protocol', detail: 'the event stream ended without a result event', deadline_remaining_ms: null }];
  const endedExpected = ['{"claude_code_version":"2.1.318","deadline_remaining_ms":null,"ending":"finish","event":"executor_round_ended","model":"claude-sonnet-5-5","num_turns":3,"permission_denials":0,"role":"build","round":1,"session_id":"@SID@","terminal_reason":"completed","usage":{"cached":2,"cost_usd":0.1,"input":6,"model":"claude-sonnet-5-5","output":4,"reasoning":null,"source":"harness","state":"complete"}}'];

  const base = JSON.parse(capture(lineRounds([[errorResult]]))[0]);
  const good = [JSON.stringify({ ...base, usage: failedExpected[0].usage, num_turns: 7, subtype: 'error_during_execution', terminal_reason: 'api_error' })];
  const noResult = capture(lineRounds([[]]));
  const ended = capture(lineRounds([[success]]));
  compareEvents(good, failedExpected);
  compareEvents(noResult, noResultExpected);
  compareLines(ended, endedExpected);
  if (process.argv[2] === 'good') {
    console.log('control accepted');
  } else {
    const edit = (lines, f) => lines.map(l => { const e = JSON.parse(l); f(e); return JSON.stringify(e); });
    const bads = [
      () => compareEvents([JSON.stringify(base)], failedExpected),
      () => compareEvents(edit(good, e => { e.usage.input = 0; }), failedExpected),
      () => compareEvents(edit(good, e => { e.usage.reasoning = 0; }), failedExpected),
      () => compareEvents(edit(good, e => { e.num_turns = 0; }), failedExpected),
      () => compareEvents(edit(good, e => { delete e.subtype; }), failedExpected),
      () => compareEvents(edit(good, e => { e.reason = 'usage_limit'; }), failedExpected),
      () => compareEvents(edit(good, e => { e.detail += '!'; }), failedExpected),
      () => compareEvents(edit(noResult, e => { e.usage = failedExpected[0].usage; }), noResultExpected),
      () => compareEvents(edit(noResult, e => { e.num_turns = 0; }), noResultExpected),
      () => compareLines([ended[0].replace('"num_turns":3,', '"num_turns":3,"subtype":"success",')], endedExpected),
      () => compareLines([JSON.stringify(JSON.parse(ended[0]), null, 1)], endedExpected),
    ];
    for (const bad of bads) assert.throws(bad);
    console.log('control rejected');
    process.exitCode = 1;
  }
}
