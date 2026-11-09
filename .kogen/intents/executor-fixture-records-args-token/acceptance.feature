Feature: Executor fixture records the runtime's arguments and token
  This feature checks that the shared fake Claude Code runtime of testkit/clauderuntime records,
  for each round, the arguments it was called with and the token it read from file descriptor 3,
  and gives them back through Fixture.Args and Fixture.Token, without changing what the fixture
  did before.

  Scenario: A round run with arguments and a token on fd 3 records both
    Given executor-fixture-records-args-token: a scratch copy of the repository
    When executor-fixture-records-args-token: I run the independent args and token probe in the scratch copy
    Then executor-fixture-records-args-token: these probe checks pass
      | check              |
      | args_file_lines    |
      | token_file_bytes   |
      | accessors_with_fd3 |

  Scenario: A round run without fd 3 still answers, records no token and Token fails the test
    Given executor-fixture-records-args-token: a scratch copy of the repository
    When executor-fixture-records-args-token: I run the independent args and token probe in the scratch copy
    Then executor-fixture-records-args-token: these probe checks pass
      | check                         |
      | round_without_fd3             |
      | accessors_fail_without_record |

  Scenario: A real adapter session leaves its model, effort, schema and stored token in the record
    Given executor-fixture-records-args-token: a scratch copy of the repository
    When executor-fixture-records-args-token: I run the independent args and token probe in the scratch copy
    Then executor-fixture-records-args-token: these probe checks pass
      | check                          |
      | adapter_session_args_and_token |

  Scenario: The existing fixture behavior and the pinned-size padding are unchanged
    Given executor-fixture-records-args-token: a scratch copy of the repository
    When executor-fixture-records-args-token: I run the independent args and token probe in the scratch copy
    Then executor-fixture-records-args-token: these probe checks pass
      | check                       |
      | existing_behavior_unchanged |

  Scenario: The testkit has its own tests of the accessors and the testkit and contract suites pass with the race detector
    When executor-fixture-records-args-token: I run the testkit and contract tests with the race detector
    Then executor-fixture-records-args-token: the packages "testkit/clauderuntime" and "contract" pass
    Then executor-fixture-records-args-token: the testkit test file calls both fixture accessors ".Args(" and ".Token("

  Scenario: Production code under executor is unchanged
    When executor-fixture-records-args-token: I list the uncommitted changes under "executor"
    Then executor-fixture-records-args-token: no file under "executor" is changed
