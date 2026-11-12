Feature: An unreadable sign-in status answer is not an authentication refusal
  This feature covers the start check of the Claude Code adapter, which runs `claude auth status --json`.

  Scenario: Unreadable answer on a successful exit is not a refusal
    Given k-exec-auth-status-unreadable-answer-named: a fake claude whose auth status prints "Update available" and exits 0
    When k-exec-auth-status-unreadable-answer-named: Kogen starts the executor
    Then k-exec-auth-status-unreadable-answer-named: the start error reason is "unavailable"
    And k-exec-auth-status-unreadable-answer-named: the start error detail contains "unreadable"
    And k-exec-auth-status-unreadable-answer-named: the start error detail contains "Update available"

  Scenario: An empty answer is named as empty
    Given k-exec-auth-status-unreadable-answer-named: a fake claude whose auth status prints nothing and exits 0
    When k-exec-auth-status-unreadable-answer-named: Kogen starts the executor
    Then k-exec-auth-status-unreadable-answer-named: the start error reason is "unavailable"
    And k-exec-auth-status-unreadable-answer-named: the start error detail contains "empty"

  Scenario: The stored token is redacted from the excerpt
    Given k-exec-auth-status-unreadable-answer-named: a fake claude whose auth status prints the stored token followed by " trailing text" and exits 0
    When k-exec-auth-status-unreadable-answer-named: Kogen starts the executor
    Then k-exec-auth-status-unreadable-answer-named: the start error detail does not contain the stored token
    And k-exec-auth-status-unreadable-answer-named: the start error detail contains "[redacted]"
    And k-exec-auth-status-unreadable-answer-named: the start error reason is "unavailable"

  Scenario: A long answer is bounded in the excerpt
    Given k-exec-auth-status-unreadable-answer-named: a fake claude whose auth status prints 5000 bytes of text and exits 0
    When k-exec-auth-status-unreadable-answer-named: Kogen starts the executor
    Then k-exec-auth-status-unreadable-answer-named: the start error detail is at most 400 bytes
    And k-exec-auth-status-unreadable-answer-named: the start error detail does not contain 300 consecutive x characters
    And k-exec-auth-status-unreadable-answer-named: the start error reason is "unavailable"

  Scenario: A failed exit with unreadable output stays unavailable
    Given k-exec-auth-status-unreadable-answer-named: a fake claude whose auth status prints "Update available" and exits 1
    When k-exec-auth-status-unreadable-answer-named: Kogen starts the executor
    Then k-exec-auth-status-unreadable-answer-named: the start error reason is "unavailable"
    And k-exec-auth-status-unreadable-answer-named: the start error detail contains "failed"

  Scenario: A readable logged-out answer keeps the sign-in refusal
    Given k-exec-auth-status-unreadable-answer-named: a fake claude whose auth status prints "{\"loggedIn\":false}" and exits 1
    When k-exec-auth-status-unreadable-answer-named: Kogen starts the executor
    Then k-exec-auth-status-unreadable-answer-named: the start error reason is "auth_refused"
    And k-exec-auth-status-unreadable-answer-named: the start error detail contains "is not signed in"

  Scenario: A logged-in claude.ai answer with an extra field starts
    Given k-exec-auth-status-unreadable-answer-named: a fake claude whose auth status prints a valid claude.ai answer with an extra field and exits 0
    When k-exec-auth-status-unreadable-answer-named: Kogen starts the executor
    Then k-exec-auth-status-unreadable-answer-named: the start succeeds
