const { When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

When('I display scalar {string} with text {string}', { timeout: 120000 }, function (kind, text) {
  this.displayScalar = JSON.parse(execFileSync('go', ['run', './features/steps/display_float_driver', kind, text], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 110000,
  }));
});

Then('the displayed scalar is {string}', function (expected) {
  assert.equal(this.displayScalar, expected);
});
