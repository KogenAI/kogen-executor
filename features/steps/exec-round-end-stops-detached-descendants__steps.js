'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {When, Then} = require('@cucumber/cucumber');
const P = 'exec-round-end-stops-detached-descendants: ';
const DRIVER = 'features/steps/exec-round-end-stops-detached-descendants__driver/';

// The fake Claude gains DetachedChild through the overlay only when the tree's fake lacks it.
// After starting the detached child the fake waits 1.5 s, so the executor sees it as a live
// descendant of the child before the script continues.
function fakeSource() {
  const src = fs.readFileSync(path.resolve('executor/claudecode/fake_test.go'), 'utf8');
  if (src.includes('DetachedChild')) return src;
  const field = '\tAuthStderrToken bool `json:"auth_stderr_token"`\n';
  const spawn = '\tif rs.APIKeyAuth {\n\t\ttime.Sleep(time.Second)';
  assert.ok(src.includes(field) && src.includes(spawn), 'fake_test.go no longer has the anchors this step patches');
  const code = '\tif cfg.DetachedChild {\n\t\tdc := exec.Command("sleep", "300")\n\t\tdc.SysProcAttr = &syscall.SysProcAttr{Setsid: true}\n\t\tif err := dc.Start(); err == nil {\n\t\t\tos.WriteFile(filepath.Join(cwd, ".detached-child.pid"), []byte(strconv.Itoa(dc.Process.Pid)), 0o644)\n\t\t}\n\t\ttime.Sleep(1500 * time.Millisecond)\n\t}\n';
  return src.replace(field, field + '\tDetachedChild bool `json:"detached_child"`\n').replace(spawn, code + spawn);
}

function runDriver(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detached-descendant-'));
  try {
    const file = scenario === 'listing' ? 'listing_test.go.txt' : 'driver_test.go.txt';
    const patched = path.join(dir, 'fake_test.go.txt');
    fs.writeFileSync(patched, fakeSource());
    const overlay = path.join(dir, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {
      [path.resolve('executor/claudecode/fake_test.go')]: patched,
      [path.resolve('executor/claudecode/zz_detached_descendant_acceptance_test.go')]: path.resolve(DRIVER + file),
    }}));
    const r = spawnSync('go', ['test', '-overlay', overlay, '-count=1', '-run', '^TestDDAAcceptance$', '-v', './executor/claudecode'], {encoding: 'utf8', timeout: 110000, env: {...process.env, DDA_SCENARIO: scenario}});
    return {scenario, status: r.status, output: (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '')};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

When(P + 'the {string} case runs against the fake Claude Code', {timeout: 120000}, function (scenario) { this.dda = runDriver(scenario); });
Then(P + 'the case passed', function () {
  const r = this.dda;
  assert.ok(r, 'the driver has not run');
  assert.equal(r.status, 0, `driver case ${r.scenario} exited ${r.status}:\n${r.output}`);
  assert.ok(r.output.includes('DDA_OK ' + r.scenario), `driver case ${r.scenario} did not complete:\n${r.output}`);
});
