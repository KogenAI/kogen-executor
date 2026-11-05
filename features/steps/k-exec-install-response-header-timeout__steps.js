const fs = require('fs');
const {Then} = require('@cucumber/cucumber');
const {run, verify, namedBound} = require('./k-exec-install-response-header-timeout__driver');

Then('k-exec-install-response-header-timeout: installing against the {string} origin yields {string}', {timeout: 120000}, function (origin, expected) {
  verify(run(origin), JSON.parse(expected));
});

Then('k-exec-install-response-header-timeout: the named default {string} is {int} seconds', function (name, seconds) {
  namedBound(fs.readFileSync('executor/claudecode/runtime.go', 'utf8'), name, seconds);
});
