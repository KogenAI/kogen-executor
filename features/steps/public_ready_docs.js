const { Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

Then('public document {string} contains literal {string}', function (file, text) {
  assert.ok(fs.readFileSync(file, 'utf8').includes(text), `${file} must contain literal ${JSON.stringify(text)}`);
});
Then('public document {string} excludes literal {string}', function (file, text) {
  assert.ok(!fs.readFileSync(file, 'utf8').includes(text), `${file} must exclude literal ${JSON.stringify(text)}`);
});
Then('public document {string} has {int} occurrence of literal {string}', function (file, count, text) {
  assert.equal(fs.readFileSync(file, 'utf8').split(text).length - 1, count, `${file}: literal occurrence count for ${JSON.stringify(text)}`);
});
Then('public policy file {string} is absent', function (file) {
  assert.ok(!fs.existsSync(file), `${file} must be absent`);
});
Then('public documentation has no identifying environment signatures', function () {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.(md|feature|qnt)$/.test(file)) files.push(file);
    }
  }
  visit('docs');
  visit('.kogen/intents');
  files.push('README.md');
  const signatures = [
    '/' + 'Users/', '/' + 'home/', '~/' + 'work.noindex/',
    'kogen-' + 'runner', 'kogen-' + 'macbook-runner',
    'kogen-' + 'linux-macbook', 'kogen-' + 'bench-eu2'
  ];
  const hits = files.flatMap(file => {
    const text = fs.readFileSync(file, 'utf8');
    return signatures.filter(value => text.includes(value)).map(() => file);
  });
  assert.deepEqual(hits, [], 'Documentation must use neutral environment placeholders');
});
