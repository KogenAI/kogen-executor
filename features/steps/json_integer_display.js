const { When, Then } = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

function displayDecoded(mode, text) {
  return JSON.parse(execFileSync('go', ['run', './features/steps/json_integer_display_driver', mode, text], {
    encoding: 'utf8', timeout: 110000,
  }));
}
When('I display JSON number {string} through the shared decoder', { timeout: 120000 }, function (text) {
  this.sharedDecodedDisplay = displayDecoded('scalar', text);
});
When('I compose a decoded review note from {string}', { timeout: 120000 }, function (text) {
  this.sharedDecodedDisplay = displayDecoded('finding', text);
});
Then('the shared decoded display is {string}', function (expected) {
  assert.equal(this.sharedDecodedDisplay, expected);
});
