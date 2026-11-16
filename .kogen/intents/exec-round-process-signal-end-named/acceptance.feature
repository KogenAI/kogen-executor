Feature: A round failure from a signal-ended Claude Code process says which signal ended it

  This feature drives the Claude Code adapter's round against a fake Claude that ends itself by a signal.

  Scenario: A signal before the init event is named and keeps the stderr tail
    When exec-round-process-signal-end-named: a round ends with the fake Claude Code ended by signal at the "before-init" point
    Then exec-round-process-signal-end-named: the failure says Claude Code was ended by signal 15 (terminated) before starting and keeps the stderr tail

  Scenario: A signal after init and before any result is named
    When exec-round-process-signal-end-named: a round ends with the fake Claude Code ended by signal at the "without-result" point
    Then exec-round-process-signal-end-named: the failure says Claude Code was ended by signal 9 (killed) without a result

  Scenario: A signal after a success result is named
    When exec-round-process-signal-end-named: a round ends with the fake Claude Code ended by signal at the "after-success" point
    Then exec-round-process-signal-end-named: the failure says Claude Code was ended by signal 9 (killed) after a success result
