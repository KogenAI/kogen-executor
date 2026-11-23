Feature: Diagnostic text extraction tests
  This feature checks that the core package tests pin how DiagnosticText and MaterialText read diagnostic content.

  Scenario: The core tests pass on the current implementation
    Given test-diagnostic-text-extraction: the current core package
    Then test-diagnostic-text-extraction: the core tests pass

  Scenario: String content is returned unchanged and text blocks are joined by one newline
    Given test-diagnostic-text-extraction: the current core package
    Then test-diagnostic-text-extraction: the core tests fail when string content is treated as blocks
    And test-diagnostic-text-extraction: the core tests fail when block text is joined without a separator

  Scenario: Malformed blocks and unsupported content contribute no text
    Given test-diagnostic-text-extraction: the current core package
    Then test-diagnostic-text-extraction: the core tests fail when a non-map block contributes text
    And test-diagnostic-text-extraction: the core tests fail when a map without string text contributes text
    And test-diagnostic-text-extraction: the core tests fail when unsupported content contributes text
