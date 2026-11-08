Feature: Executor installed runtime fixture sizing
  Scenario: Explicit short-stub regressions preserve production validation
    When e-installed-test-stub-size-check: I run the existing size rule regression
    Then e-installed-test-stub-size-check: these size rule cases pass
      | case                                    |
      | pinned_size                             |
      | one_byte_short                          |
      | one_byte_over                           |
      | unknown_size_under_the_test_origin       |
      | 507_byte_stub                           |
      | 229_byte_stub                           |

  Scenario: Installed runtime fixtures and the entire executor suite remain usable
    When e-installed-test-stub-size-check: I run the executor Go suite
    Then e-installed-test-stub-size-check: the suite passes including "TestProbeRunsInstalledRuntime"
