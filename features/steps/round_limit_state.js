'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function capture(rounds) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.limit-capture-'));
  try {
    for (const name of fs.readdirSync('contract').filter(n => n.endsWith('.go'))) {
      fs.copyFileSync(path.join('contract', name), path.join(dir, name));
    }
    fs.copyFileSync('features/steps/round_limit_probe_test.go.txt', path.join(dir, 'round_limit_probe_test.go'));
    const r = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestRoundLimitCapture$', './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 180000, env: { ...process.env, LIMIT_ROUNDS: JSON.stringify(rounds) }
    });
    assert.equal(r.status, 0, `capture go test TestRoundLimitCapture: ${r.error || ''}\n${r.stdout}${r.stderr}`);
    const rows = r.stdout.split('\n').filter(l => l.startsWith('LIMIT_CAPTURE=')).map(l => JSON.parse(l.slice(14)));
    assert.equal(rows.length, rounds.length, `go test TestRoundLimitCapture must capture every round; absent, skipped or incomplete output: ${r.stdout}${r.stderr}`);
    return rows;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function compare(actual, expected) { assert.deepStrictEqual(actual, expected); }
if (require.main !== module) {
  const { When, Then } = require('@cucumber/cucumber');
  When('the limit-state adapter receives these rounds:', { timeout: 240000 }, function (doc) {
    const rounds = JSON.parse(doc);
    this.limitCapture = capture(rounds.map(lines => lines.map(v => JSON.stringify(v))));
  });
  Then('the limit-state terminal summaries are:', function (doc) { compare(this.limitCapture, JSON.parse(doc)); });
}

if (require.main === module) {
  const baseline = capture([[JSON.stringify({type:'result', subtype:'success', is_error:false, result:'done', session_id:'@SID@', num_turns:1, terminal_reason:'completed'})]]);
  compare(baseline, [{reason:''}]);
  const expected = [{reason:'usage_limit', rate_limit_event_count:2, rate_limit_info:{status:'rejected',rateLimitType:'five_hour',resetsAt:1800000000}}];
  const actual = JSON.parse(JSON.stringify(expected));
  if (process.argv[2] !== 'good') actual[0].rate_limit_info.resetsAt = 1800000001;
  try { compare(actual, expected); console.log('control accepted'); }
  catch (_) { console.log('control rejected'); process.exitCode = 1; }
}
