Feature: Preserve decoded JSON integers without reverting float parity
  Scenario Outline: Display decoded scalar numbers
    When I display JSON number <input> through the shared decoder
    Then the shared decoded display is <expected>
    Examples:
      | input | expected |
      | "1"   | "1"      |
      | "1.5" | "1.5"    |

  Scenario: Compose a review note from decoded JSON
    When I compose a decoded review note from '{"path":"app.txt","line":1,"message":"looks fine"}'
    Then the shared decoded display is "note: app.txt:1: looks fine"

  Scenario Outline: Keep direct float parity
    When I display scalar "float" with text <input>
    Then the displayed scalar is <expected>
    Examples:
      | input | expected |
      | "1.0" | "1.0" |
      | "3.0" | "3.0" |
      | "-2.0" | "-2.0" |
      | "100.0" | "100.0" |
      | "0.5" | "0.5" |
      | "1234567.5" | "1234567.5" |
      | "123456789.123" | "123456789.123" |
      | "123456789012345.0" | "123456789012345.0" |
      | "1e14" | "1.0e14" |
      | "1.5e15" | "1.5e15" |
      | "1.5e22" | "1.5e22" |
      | "0.0001" | "0.0001" |
      | "0.00012" | "1.2e-4" |
      | "1e-7" | "1.0e-7" |
      | "1e21" | "1.0e21" |
