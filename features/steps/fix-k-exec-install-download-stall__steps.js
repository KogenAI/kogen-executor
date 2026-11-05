const {When, Then} = require('@cucumber/cucumber');
const {run, verify} = require('./fix-k-exec-install-download-stall__driver.js');

When('fix-k-exec-install-download-stall: I install the runtime through the {string} scripted transport', {timeout: 120000}, function (mode) {
  this.lateStallReport = run(mode);
});

Then('fix-k-exec-install-download-stall: the installation yields {string}', function (expected) {
  verify(this.lateStallReport, JSON.parse(expected));
});
