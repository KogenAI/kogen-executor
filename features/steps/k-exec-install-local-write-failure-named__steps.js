const {Then, setDefaultTimeout} = require('@cucumber/cucumber');
const {run, verify} = require('./k-exec-install-local-write-failure-named__driver');
setDefaultTimeout(120000);
Then('k-exec-install-local-write-failure-named: installing with the {string} fault yields {string}', function (mode, expected) {
  verify(run(mode), JSON.parse(expected));
});
