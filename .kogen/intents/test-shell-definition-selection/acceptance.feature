Feature: ShellDefinitions selection is covered by direct tests
  This feature checks that the tests in the core package fail when the selection in ShellDefinitions is changed in one wrong way.

  Scenario: ShellDefinitions tests reject a change that returns the generic shell definition
    Then test-shell-definition-selection: the core tests fail when ShellDefinitions "returns the generic shell definition"

  Scenario: ShellDefinitions tests reject a change that returns the entries in reverse order
    Then test-shell-definition-selection: the core tests fail when ShellDefinitions "returns the entries in reverse order"

  Scenario: ShellDefinitions tests reject a change that moves the shell entry to the front
    Then test-shell-definition-selection: the core tests fail when ShellDefinitions "moves the shell entry to the front"

  Scenario: ShellDefinitions tests reject a change that replaces every entry with the shell definition
    Then test-shell-definition-selection: the core tests fail when ShellDefinitions "replaces every entry with the shell definition"

  Scenario: ShellDefinitions tests reject a change that drops the last entry
    Then test-shell-definition-selection: the core tests fail when ShellDefinitions "drops the last entry"

  Scenario: ShellDefinitions tests reject a change that appends an extra shell entry
    Then test-shell-definition-selection: the core tests fail when ShellDefinitions "appends an extra shell entry"

  Scenario: ShellDefinitions tests reject a change that reads the supplied tools when no shell is requested
    Then test-shell-definition-selection: the core tests fail when ShellDefinitions "reads the supplied tools when no shell is requested"
