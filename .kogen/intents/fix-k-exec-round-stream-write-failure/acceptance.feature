Feature: A round's own failure survives a later artifact persistence failure
  Each round runs through the real Claude Code adapter with the fake claude, a synthetic token
  that holds the child's one stderr byte back until the final flush, and round-1.stderr
  symlinked to /dev/full, so persisting round-1.stderr fails after 0 bytes.

  Scenario: A deadline is kept
    When fix-k-exec-round-stream-write-failure: a "deadline" round runs with round-1.stderr on a full device
    Then fix-k-exec-round-stream-write-failure: the round fails with "executor/deadline" and the detail:
      """
      the Build deadline passed; Claude Code and its processes were stopped
      """
    And fix-k-exec-round-stream-write-failure: one executor_round_failed event has reason "deadline", that detail, artifact "round-1.stderr" and kept_bytes 0

  Scenario: A cancellation is kept
    When fix-k-exec-round-stream-write-failure: a "interrupted" round runs with round-1.stderr on a full device
    Then fix-k-exec-round-stream-write-failure: the round fails with "executor/interrupted" and the detail:
      """
      the round was interrupted; Claude Code and its processes were stopped
      """
    And fix-k-exec-round-stream-write-failure: one executor_round_failed event has reason "interrupted", that detail, artifact "round-1.stderr" and kept_bytes 0

  Scenario: A stream protocol error is kept
    When fix-k-exec-round-stream-write-failure: a "protocol" round runs with round-1.stderr on a full device
    Then fix-k-exec-round-stream-write-failure: the round fails with "executor/protocol" and the detail:
      """
      Claude Code reports permission mode "default", not acceptEdits
      """
    And fix-k-exec-round-stream-write-failure: one executor_round_failed event has reason "protocol", that detail, artifact "round-1.stderr" and kept_bytes 0

  Scenario: A usage limit is kept
    When fix-k-exec-round-stream-write-failure: a "usage_limit" round runs with round-1.stderr on a full device
    Then fix-k-exec-round-stream-write-failure: the round fails with "executor/usage_limit" and the detail:
      """
      Claude Code reported an error result: subtype "success", terminal reason "api_error"
      """
    And fix-k-exec-round-stream-write-failure: one executor_round_failed event has reason "usage_limit", that detail, artifact "round-1.stderr" and kept_bytes 0

  Scenario: A missing structured submission is kept
    When fix-k-exec-round-stream-write-failure: a "schema" round runs with round-1.stderr on a full device
    Then fix-k-exec-round-stream-write-failure: the round fails with "executor/protocol" and the detail:
      """
      the final success result of the review role has no structured_output object
      """
    And fix-k-exec-round-stream-write-failure: one executor_round_failed event has reason "protocol", that detail, artifact "round-1.stderr" and kept_bytes 0

  Scenario: A round that would succeed still fails on the persistence failure
    When fix-k-exec-round-stream-write-failure: a "success" round runs with round-1.stderr on a full device
    Then fix-k-exec-round-stream-write-failure: the round fails with "executor/failed" and the detail:
      """
      cannot persist round-1.stderr after 0 bytes
      """
    And fix-k-exec-round-stream-write-failure: one executor_round_failed event has reason "failed", that detail, artifact "round-1.stderr" and kept_bytes 0
