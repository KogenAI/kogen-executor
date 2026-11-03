Feature: Cancel token transport under pipe backpressure
  Scenario Outline: Deliver or safely refuse synthetic subscription tokens
    When I exercise token transport with "<size>" and "<mode>"
    Then token delivery returns privately without owned resources

    Examples:
      | size  | mode    |
      | large | read    |
      | large | never   |
      | large | missing |
      | short | read    |
      | short | never   |
      | short | missing |
      | empty | read    |
      | empty | never   |
      | empty | missing |
