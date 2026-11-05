# Match core text helpers to Elixir formats

Slug: core-text-differs-from-elixir-format
Model: not applicable — InspectString and Display are pure text functions with no state
Acceptance:
- .kogen/intents/core-text-differs-from-elixir-format/acceptance.feature
- features/steps/core-text-differs-from-elixir-format__steps.js

`core.InspectString` and the float64 case of `core.Display` in `core/util.go` must produce exactly the text of the reference formats they document: Elixir 1.20 `inspect/1` with `binaries: :as_strings` for every valid code point, and Elixir `"#{float}"` interpolation for float64. Their signatures, doc comments' meaning and all callers stay as they are; no other output format changes.

InspectString, for a valid UTF-8 string: the output is the string in double quotes, and each code point is written by the first matching rule:
1. `"` as `\"`; `\` as `\\`; `#` immediately followed by `{` as `\#` (the `{` then follows unchanged), so `#{` renders `\#{`.
2. Named escapes: U+0000 `\0`, U+0007 `\a`, U+0008 `\b`, U+0009 `\t`, U+000A `\n`, U+000B `\v`, U+000C `\f`, U+000D `\r`, U+001B `\e`, U+007F `\d`.
3. A backslash, `u` and exactly four uppercase hex digits of the code point for Elixir's confusable list: U+00A0, U+034F, U+061C, U+2000..U+200F, U+2028..U+202E, U+205F..U+2064, U+2066..U+2069, U+FEFF, U+FFF9..U+FFFC.
4. The raw code point for Elixir's printable ranges: U+0020..U+007E, U+00A0..U+D7FF, U+E000..U+FFFD and U+10000..U+10FFFF.
5. Any other code point below U+0100 (the remaining C0 controls and the C1 controls U+0080..U+009F): `\x` and two uppercase hex digits.
6. Any other BMP code point (U+FFFE, U+FFFF): `\x{` four uppercase hex digits `}`.
The complete per-code-point result is the rule table in acceptance.feature. This replaces the use of Go's `unicode.IsPrint` and its consequences: DEL as `\x7F`, the C1 controls U+0080..U+009F as `\u` escapes, `\u` escapes for code points Elixir prints raw (for example U+00AD, U+3000, U+E000, unassigned code points) including five- and six-digit `\u` escapes above U+FFFF, raw U+034F, and `\u` escapes for U+FFFE and U+FFFF. Strings that are not valid UTF-8 are outside this request and keep their current rendering.

Display float64 (the only Display case that changes): take the shortest round-trip decimal digits. The fixed text is those digits in plain decimal notation with `.0` appended when there is no fractional part. The exponent text is the mantissa (with `.0` appended when it is a single digit), `e`, and the decimal exponent with no plus sign and no leading zeros. Use the exponent text when the absolute value is at least 2^53 (9007199254740992); otherwise use the exponent text only when it is strictly shorter than the fixed text, else the fixed text. The current code already implements every part except the 2^53 rule, which is the change: today `9007199254740992.0` shows `9007199254740992.0` where Elixir shows `9.007199254740992e15`. NaN and infinities have no Elixir float form and keep their current text. json.Number, integer types, strings, nil, booleans and other kinds are unchanged.

## Decisions
- InspectString matches Elixir's `inspect/1` (`binaries: :as_strings`) for every valid code point, using Elixir's printable definition instead of Go's `unicode.IsPrint`; the escapes that already agree stay as they are. (source: request)
- Display renders float64 exactly as Elixir `"#{float}"`; all other kinds are unchanged. (source: request)
- No caller and no other output format changes. (source: request)

## Source comparison
- Addressed: Problem/Need strings: DEL `\d`, C1 `\x80`..`\x9F`, raw U+00AD, no `\u` escape with more than four hex digits, Elixir's printable test. Synthetic acceptance 1 examples (U+007F, U+0080, U+009F, U+00AD, U+200B, U+2028, U+FEFF, U+1F600, U+0001, U+E0001, empty string, `#{`) are literal rows in scenarios 1 to 3; the full rule over all valid code points is scenario 4 with its rule table, plus a check that no code point yields a `\u` escape with more than four hex digits.
- Addressed: Need "output stays as today where the two already agree" (quotes, backslash, `\n \t \r \e \a \b \f \v \0`, `#{`, `\xNN` for other ASCII controls, the four-digit `\u` escapes of U+200B, U+2028 and U+FEFF): rows in scenario 1 and the rule table.
- Addressed with a measured fact: U+E0001, like every code point above U+FFFF, is printable in Elixir 1.20 and is written raw, which satisfies "never produces a `\u` escape with more than four hex digits".
- Addressed: Synthetic acceptance 2 float pairs are all literal rows in scenario 5, with the Problem's `1e+21` counterexample as `1e21 -> 1.0e21`. These, the integral-float and seven-digit examples and the `path:12.0: message` finding already hold on HEAD (commit 64ffa58, the replaced Intent core-display-float-parity); they stay as executable guards. Rows for 9007199254740991.0, 9007199254740992.0, -9007199254740992.0, 12345678901234568.0 and 123456789012345680.0 cover the remaining divergence, Elixir's switch to exponent form at 2^53, measured with Elixir 1.20.4.
- Addressed: Synthetic acceptance 3 (`json.Number("3")` -> `3`, `"x"` -> `x`, nil -> empty, finding with float line 12.0 -> `path:12.0: message`) is scenario 6, with int and bool rows for the Need's unchanged kinds.
- Not applicable: `InspectStrings` does not exist in this module or its history; nothing is changed or added for it. The callers named in the Problem (protocol error, resume refusal, protected-path list, finding lines, comparison keys) are in consumer repositories and are not changed.
- Replaces: core-inspect-string-elixir-parity (no Intent directory here) and core-display-float-parity (its float rows are kept above). Nothing conflicts; README and project configuration are unchanged.

## Tests
- DEL, C1 controls, U+00AD, U+034F, U+3000, U+E000, U+FFFE/U+FFFF and code points above U+FFFF render as Elixir writes them: add a table-driven InspectString test in core/util_test.go with the request's examples and the boundary code points of each rule range (regression)
- Escapes that already agree (quotes, backslash, named escapes, `\#{`, `\x01`, the four-digit `\u` escapes of U+200B, U+2028 and U+FEFF, empty string) are unchanged: rows in the same InspectString test (unit)
- Every valid code point follows Elixir's rule table: the acceptance sweep through core.InspectString (unit)
- Floats with absolute value at least 2^53 use exponent form: add 9007199254740991.0, 9007199254740992.0, -9007199254740992.0, 12345678901234568.0 and 123456789012345680.0 to TestDisplayFloatInterpolation (regression)
- Earlier float examples, other scalar kinds and the float finding line are unchanged: TestDisplayFloatInterpolation, TestDisplayOtherScalars, TestDisplayFindingFloatLine (existing)

## Feasibility
- Reference read from the locally installed Elixir 1.20.4 (OTP 29.1.1, under ~/.local/share/mise/installs): lib/elixir/lib/inspect.ex (BitString inspect calls Code.Identifier.escape), lib/elixir/lib/code/identifier.ex (escape_map, the confusable list, the printable ranges, `\xHH` and `\x{HHHH}` fallbacks) and lib/elixir/lib/float.ex (Float.to_string is `:erlang.float_to_binary(float, [:short])`). No network documentation lookup was made; no Elixir runtime is needed by acceptance or the Build.
- Scratch sweep outside the checkout: Elixir `inspect("a" <> <<cp::utf8>> <> "b", binaries: :as_strings)` for all 1,112,064 valid code points. The acceptance rule table was derived from that output, and a scratch Go implementation of the rules above matched every code point (0 mismatches).
- Scratch float comparison: 607,543 floats (random bit patterns, powers of ten, integers near 2^53) against Elixir interpolation. HEAD's Display differed on 110,952, all with absolute value at least 2^53; HEAD's rule plus exponent form at or above 2^53 matched all.
- Scratch runs of the submitted step file with a stub step registry: on a copy with that implementation all six scenarios passed; on an unchanged copy scenario 1 failed (11 of 28 rows), scenario 4 failed (952,382 code points), scenario 5 failed (the four rows at or above 2^53) and scenarios 2, 3 and 6 passed. The step compiles its Go test into package `core_test` with `go test -overlay` using a relative overlay key, because an absolute key was silently ignored when the working directory was reached through a symlink. The code point listing writes four-digit `\u` escapes as the placeholder `<u-escape>` (expanded by the step), because the submission transport decoded literal backslash-u-hex text into raw characters in the first round.
- evidence: {"id":"core-text-observer","kind":"observer","inputs":["features/steps/core-text-differs-from-elixir-format__steps.js"],"observers":["features/steps/core-text-differs-from-elixir-format__steps.js"],"checks":[{"name":"good","command":"node features/steps/core-text-differs-from-elixir-format__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"node features/steps/core-text-differs-from-elixir-format__steps.js bad","exit":1,"output":"observer rejected bad controls\n"}]}
