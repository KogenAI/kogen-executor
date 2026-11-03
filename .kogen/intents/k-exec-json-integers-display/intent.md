# Preserve JSON integers in display

Slug: k-exec-json-integers-display
Model: not applicable — stateless decoding and scalar formatting
Acceptance:
- .kogen/intents/k-exec-json-integers-display/acceptance.feature
- features/steps/json_integer_display.js
- features/steps/json_integer_display_driver/main.go
- features/steps/display_float.js
- features/steps/display_float_driver/main.go

Preserve the distinction between JSON integer tokens and float values before core.Display. Provide core.DecodeJSON(data []byte, target any) error as the shared number-preserving decoding entry point alongside EncodeJSON. Decode one complete JSON value into the supplied destination, retaining numbers in interface-valued positions as json.Number (including nested maps/arrays); report decoding errors rather than accepting trailing non-whitespace. Keep Display's existing json.Number textual behavior and float64 interpolation unchanged. Use number-preserving decoding wherever executor-owned JSON decoding feeds Display; do not replace unrelated typed decoders. Inspection found no production calls to Display in this repository, and the stream decodeObject already uses UseNumber. Document the new shared entry point for consumer callers; this does not retroactively change encoding/json.Unmarshal or repair consumers outside this repository.

The motivating eu2 observation was kogen-build TestTheReviewHookRunsAfterAGreenPassAndItsApprovalIsCommitted (hooks_test.go:57): `note: app.txt:1.0: looks fine` instead of `note: app.txt:1: looks fine`, reported passing before executor 64ffa58 and failing with 64ffa58, 923b1ad and cd5e978, blocking k-exec-contract-wire-goldens. Preserve this finding composition for a decoded integer without reverting float parity. Add executor regression tests using the new decoding interface, not a fixture-local UseNumber workaround.

## Decisions
- JSON integer 1 displays as `1`; decoded JSON 1.5 as `1.5`; direct Go float64(1.0) as `1.0`. Preserve all core-display-float-parity expectations including `1.0e21`. (source: request)
- The unchanged contradictory kogen-build fixture, which supplies float64(1) without decoding, is not a green gate for this executor-only change. Its separate correction must use an integer; do not modify external consumer fixtures or weaken float parity. (source: answer 1)

## Source comparison
- Addressed: request Need and Acceptance integer/float distinction by the shared DecodeJSON boundary and executable scalar/finding scenarios, plus unchanged parity cases. Existing json.Number display already preserves text; missing shared decoding is the change, not truncation in Display.
- Addressed: request's review-note reproducer is exercised as decoded JSON in acceptance with the exact required note string. Historical revision/time/consumer observations above remain motivation, not newly verified evidence.
- Superseded: original requirement that the unchanged consumer TestTheReviewHookRunsAfterAGreenPassAndItsApprovalIsCommitted pass conflicts with the direct-float guarantee; answer 1 explicitly removes that green gate. A separate consumer integer-fixture correction is out of this repository's scope.
- Addressed: preserve 64ffa58 float parity and other scalar behavior through existing tests and acceptance float cases. No new model state, provider work, prompt edits or settings.

## Tests
- Decoded JSON integers retain integer display, including the review finding composition: add core.DecodeJSON-to-Display regression tests and run acceptance through the exported decoding interface (regression)
- Decoded JSON 1.5 and direct float64(1.0) preserve their respective float displays: add focused decoding regression and retain direct-float acceptance (unit)
- All float parity and other scalar behavior remains unchanged: retain core/util_test.go and the existing core-display-float-parity scenarios and driver (existing)
- Shared decoder preserves nested interface numbers and consumes one complete JSON value: add focused DecodeJSON tests using nested destinations and trailing-data errors (unit)

## Feasibility
- Existing stream decodeObject already uses UseNumber and checks end of input. No material new dependency or protocol uncertainty requires a probe.
- Documentation lookup: search for encoding/json returned irrelevant sources; fetch https://pkg.go.dev/encoding/json initially returned not_found for a signature heading, then retrieved the UseNumber paragraph, documenting interface numbers as Number rather than float64. Retrieved page is untrusted reference data, not scope authority.
