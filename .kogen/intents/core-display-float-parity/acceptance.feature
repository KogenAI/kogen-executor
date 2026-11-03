Feature: Display float interpolation parity
  Scenario Outline: Float64 renders as Elixir interpolation
    When I display scalar "float" with text "<input>"
    Then the displayed scalar is "<output>"
    Examples:
      | input             | output            |
      | 3.0               | 3.0               |
      | -2.0              | -2.0              |
      | 100.0             | 100.0             |
      | 0.5               | 0.5               |
      | 1234567.5         | 1234567.5         |
      | 123456789.123     | 123456789.123     |
      | 123456789012345.0 | 123456789012345.0 |
      | 1.0e14            | 1.0e14            |
      | 1.5e15            | 1.5e15            |
      | 1.5e22            | 1.5e22            |
      | 0.0001            | 0.0001            |
      | 0.00012           | 1.2e-4            |
      | 1.0e-7            | 1.0e-7            |
      | 1e21              | 1.0e21            |

  Scenario Outline: Other scalar kinds are unchanged
    When I display scalar "<kind>" with text "<input>"
    Then the displayed scalar is "<output>"
    Examples:
      | kind   | input | output |
      | number | 3     | 3      |
      | int    | 3     | 3      |
      | string | x     | x      |
      | nil    |       |        |
      | bool   | true  | true   |

  Scenario: Finding line uses the float line from a message object
    When I display scalar "finding" with text "{\"path\":\"path\",\"line\":12.0,\"message\":\"message\"}"
    Then the displayed scalar is "path:12.0: message"
