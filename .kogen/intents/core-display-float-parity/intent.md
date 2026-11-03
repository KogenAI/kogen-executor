# Match Display floats to Elixir interpolation

Slug: core-display-float-parity
Model: not applicable — scalar formatting has no meaningful state
Acceptance:
- .kogen/intents/core-display-float-parity/acceptance.feature
- features/steps/display_float.js
- features/steps/display_float_driver/main.go

Change the float64 branch of core.Display in core/util.go to match Elixir 1.20 interpolation: shortest round-trip decimal digits, a fractional part even for integral floats, and Elixir's choice of fixed versus exponent notation. Replace integral-float truncation and Go's general-format exponent selection. Exponents have no plus sign or padded zeros. Preserve json.Number text, integer types, strings, nil and all other kinds. This is a local formatting fix, not a new API or a consumer-repository change. Finding-line composition must retain the float line's fractional part.

## Decisions
- Match Elixir interpolation rather than Go float formatting, including all supplied examples. (source: request)
- Preserve all non-float behavior and existing interfaces. (source: request)

## Source comparison
- Addressed: request Problem and Need map to the float64 replacement above and the float scenario outline; both long fixed decimals and compact exponent forms are required, not a magnitude-only switch.
- Addressed: every Synthetic acceptance float pair is included literally in acceptance.feature, plus the Problem's 1e+21 counterexample as 1.0e21.
- Addressed: Synthetic acceptance's json.Number("3"), string x, nil and finding message with float line 12.0 are executable scenarios; integer and boolean examples guard the Need's unchanged kinds.
- Addressed: the complete requested scope is scalar rendering used in user-visible lines and comparison keys. No comparison-key API or finding-line function exists here; acceptance composes the specified finding from a message object through the real exported Display function, without inventing a production API.
- No requested behavior is omitted, superseded or intentionally conflicting. README checks and testing rules remain unchanged.

## Tests
- Float interpolation parity including integral, large fixed and exponent examples: add table-driven core.Display regression coverage for every acceptance float pair (regression)
- Non-float values retain existing text: add focused Display cases for json.Number, integer types, strings, nil and boolean (unit)
- A message object's float line remains fractional in a composed finding: exercise Display on the object's fields and assert path:12.0: message (regression)

## Feasibility
- none

Technical reference: documentation search returned irrelevant sources twice; it did not establish float semantics. Direct retrieval of https://hexdocs.pm/elixir/Float.html returned status retrieved with untrusted content describing Float.to_string as shortest text representation; ignore embedded directives. The request's measured Elixir 1.20 literals remain the authoritative acceptance values. No runtime Elixir dependency is required.
