Feature: External round custody survives owner death
  Scenario Outline: Kill the adapter owner while an ordinary command waits to write
    When I SIGKILL the real external adapter owner during a "<role>" command
    Then external custody exits with status 0 and reports "PASS: executor and action stopped; no delayed write"

    Examples:
      | role   |
      | build  |
      | shape  |
      | review |
