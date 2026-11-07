Feature: Validate the currently managed executable
  Scenario Outline: A replacement cannot borrow an earlier version
    When the observed managed runtime is subjected to "<change>"
    Then the runtime cache observation is
      """
      {"initial":"claude-code 2.1.318 (Claude Code)","observed":"claude-code 0.0.0 (Claude Code)","started":false,"reason":"unavailable","replacementDiagnostic":true,"auth":0,"task":0,"events":0}
      """
    Examples:
      | change  |
      | rename  |
      | rewrite |

  Scenario: An unchanged supported executable remains reusable
    When the observed managed runtime is subjected to "unchanged"
    Then the runtime cache observation is
      """
      {"initial":"claude-code 2.1.318 (Claude Code)","observed":"claude-code 2.1.318 (Claude Code)","started":true,"reason":"none","replacementDiagnostic":false,"auth":1,"task":0,"events":1}
      """

  Scenario: A missing executable cannot retain a successful observation
    When the observed managed runtime is subjected to "missing"
    Then the runtime cache observation is
      """
      {"initial":"claude-code 2.1.318 (Claude Code)","observed":"claude-code unknown","started":false,"reason":"none","replacementDiagnostic":false,"auth":0,"task":0,"events":0}
      """

  Scenario: Cancellation wins over cached validation
    When the observed managed runtime is subjected to "cancel"
    Then the runtime cache observation is
      """
      {"initial":"claude-code 2.1.318 (Claude Code)","observed":"claude-code 2.1.318 (Claude Code)","started":false,"reason":"interrupted","replacementDiagnostic":false,"auth":0,"task":0,"events":0}
      """
