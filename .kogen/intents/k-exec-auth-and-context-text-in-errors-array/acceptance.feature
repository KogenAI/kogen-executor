Feature: Sign-in and over-long-prompt failures are recognized in the errors list
  This feature covers the Claude Code adapter's classification of an error result.

  Scenario: Sign-in failure only in errors is auth refused
    When k-exec-auth-and-context-text-in-errors-array: Claude Code ends a round with this error result:
      """
      {"is_error": true, "subtype": "success", "terminal_reason": "api_error", "result": "", "errors": ["Failed to authenticate. API Error: 401 OAuth access token is invalid."]}
      """
    Then k-exec-auth-and-context-text-in-errors-array: the round fails as "executor/auth_refused"
    And k-exec-auth-and-context-text-in-errors-array: the failure detail is "Claude Code did not accept the sign-in; sign in again with `kogen provider login claude-code`"

  Scenario: Sign-in failure in errors with a non-string item and null result
    When k-exec-auth-and-context-text-in-errors-array: Claude Code ends a round with this error result:
      """
      {"is_error": true, "subtype": "success", "terminal_reason": "api_error", "result": null, "errors": [7, "API Error: 401 invalid"]}
      """
    Then k-exec-auth-and-context-text-in-errors-array: the round fails as "executor/auth_refused"

  Scenario: Over-long prompt only in errors is a context budget failure
    When k-exec-auth-and-context-text-in-errors-array: Claude Code ends a round with this error result:
      """
      {"is_error": true, "subtype": "success", "terminal_reason": "api_error", "result": "", "errors": ["Prompt is too long"]}
      """
    Then k-exec-auth-and-context-text-in-errors-array: the round fails as "candidate/context_budget_exceeded"
    And k-exec-auth-and-context-text-in-errors-array: the failure detail contains "the round's prompt was "
    And k-exec-auth-and-context-text-in-errors-array: the failure detail contains "nothing was clipped or retried"
    And k-exec-auth-and-context-text-in-errors-array: Claude Code was invoked 1 time

  Scenario: Over-long prompt in errors next to non-string items
    When k-exec-auth-and-context-text-in-errors-array: Claude Code ends a round with this error result:
      """
      {"is_error": true, "subtype": "success", "terminal_reason": "api_error", "result": "", "errors": [{"a": 1}, null, "Prompt is too long"]}
      """
    Then k-exec-auth-and-context-text-in-errors-array: the round fails as "candidate/context_budget_exceeded"

  Scenario: Sign-in failure in result still classifies as before
    When k-exec-auth-and-context-text-in-errors-array: Claude Code ends a round with this error result:
      """
      {"is_error": true, "subtype": "success", "terminal_reason": "api_error", "result": "Failed to authenticate. API Error: 401 OAuth access token is invalid."}
      """
    Then k-exec-auth-and-context-text-in-errors-array: the round fails as "executor/auth_refused"
    And k-exec-auth-and-context-text-in-errors-array: the failure detail is "Claude Code did not accept the sign-in; sign in again with `kogen provider login claude-code`"

  Scenario: Over-long prompt in result still classifies as before
    When k-exec-auth-and-context-text-in-errors-array: Claude Code ends a round with this error result:
      """
      {"is_error": true, "subtype": "success", "terminal_reason": "api_error", "result": "Prompt is too long"}
      """
    Then k-exec-auth-and-context-text-in-errors-array: the round fails as "candidate/context_budget_exceeded"

  Scenario: Unrelated message in errors stays a generic failure
    When k-exec-auth-and-context-text-in-errors-array: Claude Code ends a round with this error result:
      """
      {"is_error": true, "subtype": "error_during_execution", "terminal_reason": "api_error", "result": "", "errors": ["Something else broke"]}
      """
    Then k-exec-auth-and-context-text-in-errors-array: the round fails as "executor/failed"
    And k-exec-auth-and-context-text-in-errors-array: the failure detail contains "Something else broke"
