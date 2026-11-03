Feature: Bound guarded-call observation work
  Target digest limit is 1048576 bytes. Larger targets are not observable;
  an error without a hook on such a target remains an executor/protocol stop.
  The Linux synthetic fixture counts actual read bytes with /proc/self/io.

  Scenario: Bound target reads and preserve the exact digest boundary
    When I exercise bounded guarded calls with "target"
    Then the guarded-call observations satisfy the bounded-work contract

  Scenario: Read a long log only once across a round
    When I exercise bounded guarded calls with "log"
    Then the guarded-call observations satisfy the bounded-work contract

  Scenario: Preserve protocol decisions and complete a partial appended line
    When I exercise bounded guarded calls with "protocol"
    Then the guarded-call observations satisfy the bounded-work contract

  Scenario: Preserve unchanged observable targets and existing safety checks
    When I exercise bounded guarded calls with "unchanged"
    Then the guarded-call observations satisfy the bounded-work contract

  Scenario: Cancel a round with a large sparse target within normal grace
    When I exercise bounded guarded calls with "cancel"
    Then the guarded-call observations satisfy the bounded-work contract
