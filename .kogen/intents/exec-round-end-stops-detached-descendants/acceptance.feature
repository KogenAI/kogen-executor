Feature: Ending a round stops the detached descendants of the Claude Code process

  This feature drives the Claude Code adapter's round against a fake Claude that starts a descendant in its own session.

  Scenario: A cancelled round leaves no detached descendant
    When exec-round-end-stops-detached-descendants: the "cancelled" case runs against the fake Claude Code
    Then exec-round-end-stops-detached-descendants: the case passed

  Scenario: A round that fails after the child exited with status 3 leaves no detached descendant
    When exec-round-end-stops-detached-descendants: the "failed" case runs against the fake Claude Code
    Then exec-round-end-stops-detached-descendants: the case passed

  Scenario: A process that is not a descendant is never signalled
    When exec-round-end-stops-detached-descendants: the "unrelated" case runs against the fake Claude Code
    Then exec-round-end-stops-detached-descendants: the case passed

  Scenario: An unavailable process listing keeps the group kill and does not fail the round
    When exec-round-end-stops-detached-descendants: the "listing" case runs against the fake Claude Code
    Then exec-round-end-stops-detached-descendants: the case passed
