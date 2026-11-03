// Steps for the contract/ suite: they break one interface point in a scratch copy of this
// checkout and judge `go test ./contract/...`. They reuse the scratch copy, the command runner and
// its output checks of golden_update_steps.js.
const { Given, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const checkout = path.resolve(__dirname, '..', '..');
const quote = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function scratchFile(world, file) {
  assert.ok(world.dir, 'no scratch copy: start with "a scratch copy of the repository"');
  return path.join(world.dir, file);
}

function ran(world) {
  assert.ok(world.command, 'no command ran: use "I run ... in the scratch copy" first');
}

Given('in the scratch file {string} the text {string} is replaced by {string}', function (file, from, to) {
  const target = scratchFile(this, file);
  const text = fs.readFileSync(target, 'utf8');
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `${file} holds ${JSON.stringify(from)} ${count} times, not once: the fixture no longer matches the code`);
  fs.writeFileSync(target, text.replace(from, () => to));
});

Then('the output has the line {string}', function (line) {
  ran(this);
  assert.ok(this.output.split('\n').includes(line), `${this.command} output has no line ${JSON.stringify(line)}:\n${this.output}`);
});

Then('no output line is any of:', function (table) {
  ran(this);
  const lines = new Set(this.output.split('\n'));
  const found = table.raw().map(([line]) => line).filter((line) => lines.has(line));
  assert.deepEqual(found, [], `${this.command} output has the lines ${JSON.stringify(found)}:\n${this.output}`);
});

Then('the output reports the package {string} as failed', function (pkg) {
  ran(this);
  assert.notEqual(this.status, 0, `${this.command} exited 0:\n${this.output}`);
  assert.match(this.output, new RegExp('^FAIL\\s+' + quote(pkg) + '(\\s|$)', 'm'), `${this.command} did not report FAIL for ${pkg}:\n${this.output}`);
});

Then('the output reports the package {string} as ok in under {int} seconds', function (pkg, limit) {
  ran(this);
  const m = this.output.match(new RegExp('^ok\\s+' + quote(pkg) + '\\s+([0-9.]+)s', 'm'));
  assert.ok(m, `${this.command} did not report ok with a run time for ${pkg}:\n${this.output}`);
  assert.ok(Number(m[1]) < limit, `${pkg} took ${m[1]}s, not under ${limit}s`);
});

Then('the checkout file {string} has a section {string} that contains:', function (file, heading, table) {
  const lines = fs.readFileSync(path.join(checkout, file), 'utf8').split('\n');
  const start = lines.indexOf(heading);
  assert.ok(start >= 0, `${file} has no line ${JSON.stringify(heading)}`);
  const level = heading.match(/^#+/)[0].length;
  let end = start + 1;
  while (end < lines.length && !(/^#+ /.test(lines[end]) && lines[end].match(/^#+/)[0].length <= level)) end++;
  const section = lines.slice(start, end).join('\n');
  const missing = table.raw().map(([text]) => text).filter((text) => !section.includes(text));
  assert.deepEqual(missing, [], `the ${heading} section of ${file} lacks ${JSON.stringify(missing)}:\n${section}`);
});
