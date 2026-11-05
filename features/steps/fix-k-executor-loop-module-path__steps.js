'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { When, Then, After } = require('@cucumber/cucumber');

const prefix = 'fix-k-executor-loop-module-path: ';
// The landed acceptance of k-executor-loop-module-path and the one scenario of it that this
// Intent's finding is about. It runs through the real Cucumber with its own landed step file.
const feature = '.kogen/intents/k-executor-loop-module-path/acceptance.feature';
const steps = 'features/steps/k-executor-loop-module-path__steps.js';
const scenario = 'Remove bare imports from repository and actual build dependencies';

// copyCheckout copies the checkout's working tree, without .git, node_modules and Kogen's local
// state, to a new temporary directory, so a fixture can break a file without touching the checkout.
function copyCheckout(world) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-k-executor-loop-module-path-'));
  world.fkelmpDirs.push(dir);
  const from = process.cwd();
  const root = path.join(dir, 'checkout');
  const skipped = new Set(['.git', 'node_modules', path.join('.kogen', 'local')]);
  fs.cpSync(from, root, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => !skipped.has(path.relative(from, src)),
  });
  return { dir, root };
}

// breakImport applies one fixture change to the copy: {file, from, to} replaces every occurrence of
// `from` in an existing file with `to`; {file, create} writes a new file. It refuses a fixture that
// does not reach the file it means to break.
function breakImport(root, change) {
  const file = path.join(root, change.file);
  if (change.create !== undefined) {
    assert.ok(!fs.existsSync(file), `fixture: ${change.file} already exists`);
    fs.writeFileSync(file, change.create);
    return;
  }
  const before = fs.readFileSync(file, 'utf8');
  assert.ok(before.includes(change.from), `fixture: ${change.file} does not contain ${change.from}`);
  fs.writeFileSync(file, before.split(change.from).join(change.to));
  assert.ok(fs.readFileSync(file, 'utf8').includes(change.to), `fixture: ${change.file} was not changed to ${change.to}`);
}

function runLandedScenario(dir, root) {
  const cucumber = process.env.KOGEN_CUCUMBER;
  assert.ok(cucumber, 'KOGEN_CUCUMBER must name the Cucumber node_modules directory');
  const report = path.join(dir, 'report.ndjson');
  const args = [
    path.join(cucumber, '@cucumber/cucumber/bin/cucumber.js'),
    '--strict',
    '--require', steps,
    '--name', `^${scenario}$`,
    '--format', `message:${report}`,
    feature,
  ];
  const r = cp.spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, NODE_PATH: cucumber },
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const ran = `cucumber ${feature} --name ^${scenario}$ in ${root}`;
  assert.ok(!r.error, `${ran}: ${r.error}`);
  assert.ok(fs.existsSync(report), `${ran} wrote no report (exit ${r.status}):\n${r.stdout}${r.stderr}`);
  const messages = fs.readFileSync(report, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const pickles = new Map();
  for (const m of messages) if (m.pickle) pickles.set(m.pickle.id, m.pickle.name);
  const cases = new Map();
  for (const m of messages) if (m.testCase) cases.set(m.testCase.id, m.testCase.pickleId);
  const started = new Map();
  for (const m of messages) if (m.testCaseStarted) started.set(m.testCaseStarted.id, pickles.get(cases.get(m.testCaseStarted.testCaseId)));
  const results = new Map();
  for (const m of messages) {
    if (!m.testStepFinished) continue;
    const name = started.get(m.testStepFinished.testCaseStartedId);
    if (!results.has(name)) results.set(name, []);
    results.get(name).push(m.testStepFinished.testStepResult.status);
  }
  return {
    exit: r.status,
    scenarios: [...started.values()],
    statuses: Object.fromEntries(results),
    output: `${ran} (exit ${r.status}):\n${r.stdout}${r.stderr}`,
  };
}

When(prefix + 'the landed import check runs on a copy of the checkout with:', { timeout: 360000 }, function (doc) {
  const changes = JSON.parse(doc);
  this.fkelmpDirs = this.fkelmpDirs || [];
  const { dir, root } = copyCheckout(this);
  for (const change of changes) breakImport(root, change);
  this.fkelmpRun = runLandedScenario(dir, root);
});

Then(prefix + 'the landed import check result is:', function (doc) {
  const expected = JSON.parse(doc);
  const run = this.fkelmpRun;
  assert.deepEqual(run.scenarios, [scenario], `scenarios run\n${run.output}`);
  assert.deepEqual(run.statuses[scenario], expected.statuses, `step statuses of "${scenario}"\n${run.output}`);
  assert.equal(run.exit, expected.exit, `cucumber exit status\n${run.output}`);
});

After(function () {
  for (const dir of this.fkelmpDirs || []) fs.rmSync(dir, { recursive: true, force: true });
});
