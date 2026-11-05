Feature: Core text matches Elixir inspect and interpolation

  Scenario: InspectString writes Elixir's text for one code point between two letters
    When core-text-differs-from-elixir-format: I inspect each code point between "a" and "b":
      """
      U+007F "a\db"
      U+0080 "a\x80b"
      U+009F "a\x9Fb"
      U+00AD "a<raw>b"
      U+200B "a<u-escape>b"
      U+2028 "a<u-escape>b"
      U+FEFF "a<u-escape>b"
      U+1F600 "a<raw>b"
      U+0001 "a\x01b"
      U+E0001 "a<raw>b"
      U+00A0 "a<u-escape>b"
      U+034F "a<u-escape>b"
      U+3000 "a<raw>b"
      U+E000 "a<raw>b"
      U+FFFE "a\x{FFFE}b"
      U+FFFF "a\x{FFFF}b"
      U+10FFFF "a<raw>b"
      U+0022 "a\"b"
      U+005C "a\\b"
      U+000A "a\nb"
      U+0009 "a\tb"
      U+000D "a\rb"
      U+001B "a\eb"
      U+0007 "a\ab"
      U+0008 "a\bb"
      U+000C "a\fb"
      U+000B "a\vb"
      U+0000 "a\0b"
      """
    Then core-text-differs-from-elixir-format: every result is as listed

  Scenario: InspectString of the empty string is two quotes
    When core-text-differs-from-elixir-format: I inspect the text ""
    Then core-text-differs-from-elixir-format: the inspected text is:
      """
      ""
      """

  Scenario: InspectString still escapes interpolation
    When core-text-differs-from-elixir-format: I inspect the text "#{"
    Then core-text-differs-from-elixir-format: the inspected text is:
      """
      "\#{"
      """

  Scenario: InspectString follows Elixir's rules for every valid code point
    When core-text-differs-from-elixir-format: I inspect every valid code point between "a" and "b"
    Then core-text-differs-from-elixir-format: each code point renders by these rules:
      """
      U+0000 \0
      U+0001..U+0006 \xHH
      U+0007 \a
      U+0008 \b
      U+0009 \t
      U+000A \n
      U+000B \v
      U+000C \f
      U+000D \r
      U+000E..U+001A \xHH
      U+001B \e
      U+001C..U+001F \xHH
      U+0020..U+0021 raw
      U+0022 \"
      U+0023..U+005B raw
      U+005C \\
      U+005D..U+007E raw
      U+007F \d
      U+0080..U+009F \xHH
      U+00A0 \uHHHH
      U+00A1..U+034E raw
      U+034F \uHHHH
      U+0350..U+061B raw
      U+061C \uHHHH
      U+061D..U+1FFF raw
      U+2000..U+200F \uHHHH
      U+2010..U+2027 raw
      U+2028..U+202E \uHHHH
      U+202F..U+205E raw
      U+205F..U+2064 \uHHHH
      U+2065 raw
      U+2066..U+2069 \uHHHH
      U+206A..U+D7FF raw
      U+E000..U+FEFE raw
      U+FEFF \uHHHH
      U+FF00..U+FFF8 raw
      U+FFF9..U+FFFC \uHHHH
      U+FFFD raw
      U+FFFE..U+FFFF \x{HHHH}
      U+10000..U+10FFFF raw
      """
    And core-text-differs-from-elixir-format: no inspected text has a u-escape with more than four hex digits

  Scenario: Display renders float64 values the way Elixir interpolates them
    When core-text-differs-from-elixir-format: I display each value:
      | kind    | input                | output                 |
      | float64 | 3.0                  | 3.0                    |
      | float64 | -2.0                 | -2.0                   |
      | float64 | 100.0                | 100.0                  |
      | float64 | 0.5                  | 0.5                    |
      | float64 | 1234567.5            | 1234567.5              |
      | float64 | 123456789.123        | 123456789.123          |
      | float64 | 123456789012345.0    | 123456789012345.0      |
      | float64 | 1.0e14               | 1.0e14                 |
      | float64 | 1.5e15               | 1.5e15                 |
      | float64 | 1.5e22               | 1.5e22                 |
      | float64 | 0.0001               | 0.0001                 |
      | float64 | 0.00012              | 1.2e-4                 |
      | float64 | 1.0e-7               | 1.0e-7                 |
      | float64 | 1e21                 | 1.0e21                 |
      | float64 | 12.0                 | 12.0                   |
      | float64 | 9007199254740991.0   | 9007199254740991.0     |
      | float64 | 9007199254740992.0   | 9.007199254740992e15   |
      | float64 | -9007199254740992.0  | -9.007199254740992e15  |
      | float64 | 12345678901234568.0  | 1.2345678901234568e16  |
      | float64 | 123456789012345680.0 | 1.2345678901234568e17  |
    Then core-text-differs-from-elixir-format: every result is as listed

  Scenario: Display keeps the text of other kinds and finding lines keep the float line
    When core-text-differs-from-elixir-format: I display each value:
      | kind        | input                                            | output             |
      | json.Number | 3                                                | 3                  |
      | int         | 3                                                | 3                  |
      | string      | x                                                | x                  |
      | nil         |                                                  |                    |
      | bool        | true                                             | true               |
      | finding     | {"path":"path","line":12.0,"message":"message"} | path:12.0: message |
    Then core-text-differs-from-elixir-format: every result is as listed
