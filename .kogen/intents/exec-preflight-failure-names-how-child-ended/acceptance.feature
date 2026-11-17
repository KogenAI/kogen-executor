Feature: Failed no-model-call Claude Code checks say how the child process ended

  This feature runs stand-in Claude Code scripts through the adapter's version check command and its auth status check.

  Scenario: An exit status without output is named
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "exit-status" runs
    Then exec-preflight-failure-names-how-child-ended: the version check failure is the command, then failed, then exited with status 3 and nothing more

  Scenario: An exit status with stderr keeps the stderr after the status
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "exit-status-stderr" runs
    Then exec-preflight-failure-names-how-child-ended: the version check failure ends with exited with status 3, then a semicolon and the stderr text boom

  Scenario: A signal ending is named
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "signal" runs
    Then exec-preflight-failure-names-how-child-ended: the version check failure says it was ended by signal 9 (killed)

  Scenario: A start error is named
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "start-error" runs
    Then exec-preflight-failure-names-how-child-ended: the version check failure says it could not start with the fork/exec error for the missing path

  Scenario: The stderr text stays bounded
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "stderr-bounded" runs
    Then exec-preflight-failure-names-how-child-ended: the version check failure keeps the stderr text bounded to 300 bytes after the status

  Scenario: The auth status failure names an exit status and keeps the advice
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "auth-exit" runs
    Then exec-preflight-failure-names-how-child-ended: the auth status failure says it exited with status 2 in parentheses and ends with the sign-in advice

  Scenario: The auth status failure names a signal
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "auth-signal" runs
    Then exec-preflight-failure-names-how-child-ended: the auth status failure says it was ended by signal 15 (terminated) in parentheses and ends with the sign-in advice

  Scenario: The auth status failure names a start error
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "auth-start-error" runs
    Then exec-preflight-failure-names-how-child-ended: the auth status failure says it could not start in parentheses and ends with the sign-in advice

  Scenario: The auth status stderr is never shown
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "auth-stderr-hidden" runs
    Then exec-preflight-failure-names-how-child-ended: the auth status failure does not show the stderr text

  Scenario: An unreadable successful answer keeps its own detail
    When exec-preflight-failure-names-how-child-ended: the stand-in Claude Code check "auth-unreadable" runs
    Then exec-preflight-failure-names-how-child-ended: the auth status failure is the unreadable answer detail without a process ending
