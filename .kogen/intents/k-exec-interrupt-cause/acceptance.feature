Feature: Round interruption cause and initial deadline budget
  Scenario: Distinguish causes without changing errors or measuring remaining time at round end
    When I capture real round interruption metadata under the race detector
    Then the round interruption records match:
      """
      [
        ["deadline", "deadline", null, 1, false, "zero"],
        ["term", "signal", 15, 143, true, "none"],
        ["int", "signal", 2, 130, true, "none"],
        ["cancel", "cancelled", null, 1, false, "none"],
        ["task_earlier", "cancelled", null, 1, false, "bracket"],
        ["context_earlier", "cancelled", null, 1, false, "bracket"],
        ["success", null, null, 0, false, "none"]
      ]
      """
