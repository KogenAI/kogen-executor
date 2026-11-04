const {Then, setDefaultTimeout} = require('@cucumber/cucumber');
const {run, verify} = require('./k-exec-install-download-transient-retry__driver');
setDefaultTimeout(60000);
Then('k-exec-install-download-transient-retry: installing with {string} yields {string}', function (mode, expected) {
  verify(run(mode), JSON.parse(expected));
});
