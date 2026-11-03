Feature: Preserve shared Claude config permissions
  Scenario Outline: Prepare the config directory
    When runtime preparation uses a "<kind>" config directory
    Then config permissions are "<mode>" and the config link is "<link>"

    Examples:
      | kind    | mode | link  |
      | linked  | 775  | true  |
      | missing | 700  | false |
      | plain   | 700  | false |
