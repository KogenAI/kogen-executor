Feature: Detect failed retained round artifact writes
  Scenario: A full retained stream fails the executor
    Then k-exec-round-stream-write-failure: stream obeys the retained artifact contract

  Scenario: A full retained stderr fails the executor
    Then k-exec-round-stream-write-failure: stderr obeys the retained artifact contract

  Scenario: A fitting round preserves its evidence
    Then k-exec-round-stream-write-failure: fits obeys the retained artifact contract
