'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
function capture() {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.interrupt-capture-'));
  try {
    for (const name of fs.readdirSync('executor/claudecode').filter(n => n.endsWith('.go'))) fs.copyFileSync(path.join('executor/claudecode', name), path.join(dir, name));
    fs.copyFileSync('features/steps/interrupt_capture_test.go.txt', path.join(dir, 'interrupt_acceptance_test.go'));
    const command = 'go test -race -count=1 -v -run ^TestInterruptAcceptanceCapture$ ./' + path.basename(dir);
    const r = spawnSync('go', ['test', '-race', '-count=1', '-v', '-run', '^TestInterruptAcceptanceCapture$', './' + path.basename(dir)], {encoding:'utf8', timeout:240000});
    assert.equal(r.status, 0, `TestInterruptAcceptanceCapture: ${command}; outcome ${r.status}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
    const payloads = r.stdout.split('\n').filter(l => l.startsWith('INTERRUPT_CAPTURE='));
    assert.equal(payloads.length, 1, `TestInterruptAcceptanceCapture absent, skipped or ran zero times: ${command}; outcome ${r.status}\n${r.stdout}${r.stderr}`);
    return JSON.parse(payloads[0].slice('INTERRUPT_CAPTURE='.length));
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
const expected = [
  ['deadline','deadline',null,1,false,'zero'],
  ['term','signal',15,143,true,'none'],
  ['int','signal',2,130,true,'none'],
  ['cancel','cancelled',null,1,false,'none'],
  ['task_earlier','cancelled',null,1,false,'bracket'],
  ['context_earlier','cancelled',null,1,false,'bracket'],
  ['success',null,null,0,false,'none']
];
function verify(rows, specs) {
  assert.deepEqual(rows.map(r => r.name), specs.map(r => r[0]));
  rows.forEach((r,i) => {
    const [name,cause,signal,code,same,deadline] = specs[i];
    assert.equal(r.events.length,1, `${name}: exactly one terminal event`);
    const e = r.events[0];
    assert.equal(e.event, name === 'success' ? 'executor_round_ended' : 'executor_round_failed', name);
    assert.equal(e.interrupt_cause ?? null,cause,name);
    assert.equal(e.signal ?? null,signal,name);
    assert.equal(r.code,code,name);
    assert.equal(r.same_signal,same,name);
    assert.ok(Object.hasOwn(e,'deadline_remaining_ms'), `${name}: deadline snapshot must be explicit`);
    if (deadline === 'none') assert.equal(e.deadline_remaining_ms,null,name);
    else if (deadline === 'zero') assert.equal(e.deadline_remaining_ms,0,name);
    else {
      assert.ok(Number.isInteger(e.deadline_remaining_ms), `${name}: integer snapshot`);
      assert.ok(e.deadline_remaining_ms >= r.lower && e.deadline_remaining_ms <= r.upper, `${name}: ${e.deadline_remaining_ms} outside start bracket [${r.lower},${r.upper}]`);
    }
  });
}
if (require.main !== module) {
  const {When,Then} = require('@cucumber/cucumber');
  When('I capture real round interruption metadata under the race detector', {timeout:300000}, function () { this.interruptRows = capture(); });
  Then('the round interruption records match:', function (doc) { verify(this.interruptRows, JSON.parse(doc)); });
} else {
  // The actual unchanged adapter exercises capture and the existing fake runtime.
  // Supply only the new metadata to make a known-good observer fixture.
  const rows = capture();
  rows.forEach((r,i) => {
    const [,cause,signal,,,deadline] = expected[i];
    const e = r.events[0];
    e.interrupt_cause = cause;
    e.signal = signal;
    e.deadline_remaining_ms = deadline === 'none' ? null : deadline === 'zero' ? 0 : r.upper;
  });
  verify(rows, expected);
  if (process.argv[2] === 'good') { console.log('observer accepted'); }
  else {
    const changes = [];
    rows.forEach((r,i) => {
      changes.push(x => {x[i].events = [];});
      changes.push(x => {x[i].events[0].interrupt_cause = 'wrong';});
      changes.push(x => {x[i].events[0].signal = 99;});
      changes.push(x => {x[i].code = -99;});
      changes.push(x => {x[i].same_signal = !x[i].same_signal;});
      changes.push(x => {delete x[i].events[0].deadline_remaining_ms;});
      changes.push(x => {x[i].events[0].deadline_remaining_ms = expected[i][5] === 'bracket' ? x[i].lower - 11 : 99;});
    });
    for (const change of changes) {
      const bad = structuredClone(rows); change(bad);
      assert.throws(() => verify(bad,expected));
    }
    console.log('observer rejected mutations'); process.exitCode = 1;
  }
}
