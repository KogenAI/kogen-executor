Feature: Direct EncodeJSON regression coverage
  This feature adds tests in core/util_test.go, not changes to encoding behavior or callers.
  HTML-sensitive characters must remain literal, successful output must have no final
  newline and decode to the original value, and unsupported inputs must return errors.
  The existing example encodes {"html":"<b>Tom & Jerry</b>"} to those exact JSON bytes.
  A channel is an unsupported value. Default HTML escaping, a retained newline,
  invalid JSON and a suppressed encoder error are regressions the tests must detect.

  Background:
    Given core-encode-json-contract-tests: the utility source and direct test file are present

  Scenario: Successful output is decoded in a direct regression test
    Then core-encode-json-contract-tests: a direct test decodes the successful result

  Scenario: HTML-sensitive characters are literal
    Then core-encode-json-contract-tests: the direct tests reject the "html" regression

  Scenario: Successful output has no final newline
    Then core-encode-json-contract-tests: the direct tests reject the "newline" regression

  Scenario: Successful output is valid JSON
    Then core-encode-json-contract-tests: the direct tests reject the "invalid" regression

  Scenario: Unsupported values return an error
    Then core-encode-json-contract-tests: the direct tests reject the "error" regression
