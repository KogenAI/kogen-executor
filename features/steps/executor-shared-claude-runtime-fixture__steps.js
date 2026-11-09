// Steps of executor-shared-claude-runtime-fixture. Go commands that change files run in a
// scratch copy of this checkout; the independent consumer probe (a Go test file that uses only
// the public API of testkit/clauderuntime) is copied into that scratch copy.
const { After, Given, When, Then, setDefaultTimeout } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

setDefaultTimeout(280000);

const P = 'executor-shared-claude-runtime-fixture: ';
const checkout = path.resolve(__dirname, '..', '..');
const probeFile = path.join(__dirname, 'executor-shared-claude-runtime-fixture__probe', 'consumer_probe_test.go.txt');
const skipped = new Set(['.git', 'node_modules', path.join('.kogen', 'local')]);
const pkgPath = 'github.com/KogenAI/kogen-executor/testkit/clauderuntime';
// The pinned executable size per platform, as the pin table of this repository lists it.
const pins = { 'linux/amd64': 337814032, 'darwin/arm64': 319598464 };
const platform = () => ({ linux: 'linux', darwin: 'darwin' }[process.platform] + '/' + ({ x64: 'amd64', arm64: 'arm64' }[process.arch]));

After(function () {
  if (this.dir) fs.rmSync(this.dir, { recursive: true, force: true });
});

function go(cwd, args) {
  const run = spawnSync('go', args, { cwd, encoding: 'utf8', timeout: 270000, maxBuffer: 64 * 1024 * 1024 });
  assert.ifError(run.error);
  assert.equal(run.signal, null, `go ${args.join(' ')} was killed by ${run.signal}`);
  return { command: `go ${args.join(' ')}`, status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function jsonEvents(run) {
  return run.stdout.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
}

function passed(run, name) {
  const n = jsonEvents(run).filter((e) => e.Test === name && e.Action === 'pass').length;
  assert.equal(n, 1, `${run.command}: test ${name} did not pass exactly once (passed ${n} times; status ${run.status})\n${run.stdout.slice(-4000)}\n${run.stderr.slice(-2000)}`);
}

function testOutput(run, name) {
  return jsonEvents(run).filter((e) => e.Test === name && e.Action === 'output').map((e) => e.Output).join('');
}

function reported(run, name, key) {
  const m = testOutput(run, name).match(new RegExp('probe ' + key.replace('.', '\\.') + '=(\\S+)'));
  assert.ok(m, `${run.command}: ${name} reported no "probe ${key}=" line\n${run.stdout.slice(-3000)}\n${run.stderr.slice(-2000)}`);
  return m[1];
}

function goFiles(dir) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.go')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

Given(P + 'a scratch copy of the repository', function () {
  this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-clauderuntime-'));
  fs.cpSync(checkout, this.dir, { recursive: true, filter: (src) => !skipped.has(path.relative(checkout, src)) });
});

Given(P + 'the scratch pin table is changed to version {string} with each pinned size one byte larger', function (version) {
  const file = path.join(this.dir, 'executor', 'claudecode', 'runtime.go');
  let text = fs.readFileSync(file, 'utf8');
  const edits = [['const Version = "2.1.318"', `const Version = "${version}"`], ['319598464', '319598465'], ['337814032', '337814033']];
  for (const [from, to] of edits) {
    assert.equal(text.split(from).length - 1, 1, `executor/claudecode/runtime.go holds ${JSON.stringify(from)} not exactly once: the pin table moved`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(file, text);
});

When(P + 'I run the independent consumer probe in the scratch copy', function () {
  fs.mkdirSync(path.join(this.dir, 'testkit', 'clauderuntime'), { recursive: true });
  fs.copyFileSync(probeFile, path.join(this.dir, 'testkit', 'clauderuntime', 'consumer_probe_test.go'));
  this.run = go(this.dir, ['test', '-json', '-count=1', '-run', '^TestConsumerProbe$', './testkit/clauderuntime/']);
});

When(P + 'I run the testkit tests with the consumer probe in the scratch copy', function () {
  fs.mkdirSync(path.join(this.dir, 'testkit', 'clauderuntime'), { recursive: true });
  fs.copyFileSync(probeFile, path.join(this.dir, 'testkit', 'clauderuntime', 'consumer_probe_test.go'));
  this.run = go(this.dir, ['test', '-json', '-count=1', './testkit/...']);
});

Then(P + 'these probe checks pass', function (table) {
  assert.ok(fs.existsSync(path.join(this.dir, 'testkit', 'clauderuntime', 'fixture.go')), 'testkit/clauderuntime/fixture.go does not exist: the shared fixture is not extracted');
  passed(this.run, 'TestConsumerProbe');
  for (const row of table.hashes()) passed(this.run, `TestConsumerProbe/${row.check}`);
  assert.equal(this.run.status, 0, `${this.run.command} failed\n${this.run.stdout.slice(-4000)}\n${this.run.stderr.slice(-2000)}`);
});

Then(P + 'the probe reports the pinned version {string} and the pinned size of this platform', function (version) {
  assert.equal(reported(this.run, 'TestConsumerProbe', 'claudecode.Version'), version);
  const want = pins[platform()];
  assert.ok(want, `no pinned size is listed for ${platform()}`);
  assert.equal(Number(reported(this.run, 'TestConsumerProbe/version_answer', 'stub_size')), want);
});

Then(P + 'the testkit tests pass and the probe reports version {string} and the changed size of this platform', function (version) {
  assert.ok(fs.existsSync(path.join(this.dir, 'testkit', 'clauderuntime', 'fixture.go')), 'testkit/clauderuntime/fixture.go does not exist: the shared fixture is not extracted');
  assert.equal(this.run.status, 0, `${this.run.command} failed in the scratch copy with the changed pin table\n${this.run.stdout.slice(-4000)}\n${this.run.stderr.slice(-2000)}`);
  passed(this.run, 'TestConsumerProbe');
  assert.equal(reported(this.run, 'TestConsumerProbe', 'claudecode.Version'), version);
  const want = pins[platform()] + 1;
  assert.equal(Number(reported(this.run, 'TestConsumerProbe/version_answer', 'stub_size')), want);
  const own = jsonEvents(this.run).filter((e) => e.Package === pkgPath && e.Action === 'pass' && e.Test && !e.Test.includes('/') && e.Test !== 'TestConsumerProbe');
  assert.ok(own.length >= 1, `${this.run.command}: the testkit package passed no test of its own besides the probe`);
});

When(P + 'I list the Go packages with their dependencies', function () {
  const run = go(checkout, ['list', '-f', '{{.ImportPath}}|{{join .Deps " "}}', './...']);
  assert.equal(run.status, 0, `${run.command} failed\n${run.stderr}`);
  this.packages = run.stdout.split('\n').filter(Boolean).map((l) => {
    const [name, deps] = l.split('|');
    return { name, deps: deps.split(' ').filter(Boolean) };
  });
});

Then(P + 'the package {string} exists and no package outside testkit depends on it', function (rel) {
  const name = 'github.com/KogenAI/kogen-executor/' + rel;
  assert.ok(this.packages.some((p) => p.name === name), `go list ./... lists no package ${name}`);
  const users = this.packages.filter((p) => !p.name.includes('/testkit/') && p.deps.includes(name)).map((p) => p.name);
  assert.deepEqual(users, [], `these non-test packages are built with ${name}, so the test fixture would reach production binaries`);
});

Then(P + 'the fake runtime script is defined in exactly one Go file, under {string}', function (dir) {
  const marker = '"$1" = "--version"';
  const found = [];
  for (const top of ['testkit', 'contract', 'executor', 'agent', 'core', 'internal', 'testproc', 'thinking', 'consumes']) {
    for (const f of goFiles(path.join(checkout, top))) {
      if (fs.readFileSync(f, 'utf8').includes(marker)) found.push(path.relative(checkout, f));
    }
  }
  assert.equal(found.length, 1, `the shell script answering --version is defined in ${JSON.stringify(found)}, not in exactly one file`);
  assert.ok(found[0].startsWith(dir + '/'), `the shell script answering --version is defined in ${found[0]}, not under ${dir}`);
});

Then(P + 'no Go file under testkit or contract carries a pinned runtime size', function () {
  const hits = [];
  for (const dir of ['testkit', 'contract']) {
    for (const f of goFiles(path.join(checkout, dir))) {
      const text = fs.readFileSync(f, 'utf8');
      for (const n of Object.values(pins)) if (text.includes(String(n))) hits.push(`${path.relative(checkout, f)} has ${n}`);
    }
  }
  assert.deepEqual(hits, [], 'the pin table of executor/claudecode must stay the only owner of the pinned sizes');
});

Then(P + 'a contract test file imports the shared fixture package', function () {
  const importing = goFiles(path.join(checkout, 'contract')).filter((f) => fs.readFileSync(f, 'utf8').includes(`"${pkgPath}"`));
  assert.ok(importing.length >= 1, `no Go file under contract imports ${pkgPath}`);
});

When(P + 'I run the focused contract and testkit tests with the race detector', function () {
  this.run = go(checkout, ['test', '-race', '-count=1', './testkit/...', './contract/...']);
});

Then(P + 'the packages {string} and {string} pass', function (a, b) {
  for (const rel of [a, b]) {
    const re = new RegExp('^ok\\s+github\\.com/KogenAI/kogen-executor/' + rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s', 'm');
    assert.match(this.run.stdout, re, `${this.run.command}: package ${rel} did not report ok (status ${this.run.status})\n${this.run.stdout}\n${this.run.stderr.slice(-3000)}`);
  }
  assert.equal(this.run.status, 0, `${this.run.command} failed\n${this.run.stdout}\n${this.run.stderr.slice(-3000)}`);
});
