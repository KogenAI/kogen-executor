Feature: Detect completed guarded calls without hooks
  Scenario Outline: Classify a hookless Write by its actual outcome
    When k-exec-shape-hookless-success: a fake child runs <role> with <initial> target, <change> mutation and <result> result
    Then k-exec-shape-hookless-success: the outcome is <outcome>

    Examples:
      | role   | initial | change    | result  | outcome  |
      | shape  | file    | changed   | success | protocol |
      | shape  | file    | unchanged | success | protocol |
      | shape  | file    | changed   | error   | protocol |
      | shape  | absent  | changed   | error   | protocol |
      | shape  | file    | unchanged | error   | denied   |
      | build  | file    | changed   | success | protocol |
      | review | file    | changed   | success | protocol |
      | build  | file    | unchanged | error   | rejected |
      | review | file    | unchanged | error   | rejected |
