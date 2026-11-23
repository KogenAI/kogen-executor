Feature: EncodeJSON output contract is covered by direct tests
  This feature checks that the tests in the core package fail when EncodeJSON is changed in one wrong way.

  Scenario: EncodeJSON tests reject a change that escapes HTML characters
    Then test-encode-json-contract: the core tests fail when EncodeJSON "escapes HTML characters"

  Scenario: EncodeJSON tests reject a change that keeps the final newline
    Then test-encode-json-contract: the core tests fail when EncodeJSON "keeps the final newline"

  Scenario: EncodeJSON tests reject a change that swallows the encoding error
    Then test-encode-json-contract: the core tests fail when EncodeJSON "swallows the encoding error"
