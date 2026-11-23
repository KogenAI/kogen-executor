Feature: ExecutorUsage aggregation is covered by direct tests
  This feature checks that the tests in the core package fail when ExecutorUsage.Plus is changed in one wrong way.

  Scenario: ExecutorUsage tests reject a change that replaces the totals
    Then core-executor-usage-aggregation-tests: the core tests fail when ExecutorUsage.Plus "replaces the totals instead of adding"

  Scenario: ExecutorUsage tests reject a change that retains the older source
    Then core-executor-usage-aggregation-tests: the core tests fail when ExecutorUsage.Plus "retains the older source"

  Scenario: ExecutorUsage tests reject a change that treats a missing count as zero
    Then core-executor-usage-aggregation-tests: the core tests fail when ExecutorUsage.Plus "treats a missing count or cost as zero"

  Scenario: ExecutorUsage tests reject a change that discards known totals
    Then core-executor-usage-aggregation-tests: the core tests fail when ExecutorUsage.Plus "discards the known totals when a count is unknown"

  Scenario: ExecutorUsage tests reject a change that marks the first round partial
    Then core-executor-usage-aggregation-tests: the core tests fail when ExecutorUsage.Plus "marks the first round partial"

  Scenario: ExecutorUsage tests reject a change that accepts a conflicting later state
    Then core-executor-usage-aggregation-tests: the core tests fail when ExecutorUsage.Plus "accepts a conflicting later state"

  Scenario: ExecutorUsage tests reject a change that leaves an empty round state empty
    Then core-executor-usage-aggregation-tests: the core tests fail when ExecutorUsage.Plus "leaves an empty round state empty"
