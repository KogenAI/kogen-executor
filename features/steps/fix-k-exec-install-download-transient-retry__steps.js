const {When, Then} = require('@cucumber/cucumber');
const {run, verify} = require('./fix-k-exec-install-download-transient-retry__driver.js');

When('fix-k-exec-install-download-transient-retry: I install the runtime through the {string} scripted transport', {timeout: 120000}, function (mode) {
  this.downloadPolicyReport = run(mode);
});

Then('fix-k-exec-install-download-transient-retry: the installation yields {string}', function (expected) {
  verify(this.downloadPolicyReport, JSON.parse(expected));
});
