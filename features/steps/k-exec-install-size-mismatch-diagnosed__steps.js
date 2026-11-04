const {Then, setDefaultTimeout} = require('@cucumber/cucumber');
const {run, verify} = require('./k-exec-install-size-mismatch-diagnosed__driver');
setDefaultTimeout(120000);
Then('k-exec-install-size-mismatch-diagnosed: installing from a {string} origin yields {string}', function (origin, expected) {
  verify(run(origin), JSON.parse(expected));
});
