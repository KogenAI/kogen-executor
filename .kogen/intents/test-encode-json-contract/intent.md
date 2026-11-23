# Test the EncodeJSON output contract

Slug: test-encode-json-contract
Model: not applicable — EncodeJSON is a stateless pure encoding function with no meaningful state
Acceptance:
- .kogen/intents/test-encode-json-contract/acceptance.feature
- features/steps/test-encode-json-contract__steps.js

Add direct tests to core/util_test.go for core.EncodeJSON, which returns the JSON of a value without HTML escaping and without the encoder's final newline. Only core/util_test.go changes: the JSON encoding options, EncodeJSON itself (core/util.go) and its callers stay exactly as they are.

The tests assert two behaviors. (1) Encoding a value containing HTML-sensitive characters preserves those characters and returns no final newline: the exact bytes are compared, so default HTML escaping or a retained trailing newline fails. (2) Encoding a value that JSON cannot represent returns an error: a swallowed encoding failure that returns successful output fails the error assertion.

## Decisions
- The tests are added to core/util_test.go next to the existing Display and ShellDefinitions tests, in package core, with no new imports; the first compares the exact string of EncodeJSON(map[string]string{"html": "<b>Tom & Jerry</b>"}) with {"html":"<b>Tom & Jerry</b>"}, the second asserts a non-nil error for a channel value. (constraint: core/util.go stays identical to HEAD) (evidence: core/util.go; core/util_test.go) (source: request)
- Acceptance is by mutation of a scratch copy of core/util.go: each wrong change (HTML escaping on, final newline kept, encoding error swallowed) must make `go test ./core` fail with a failing test, after the same command passed on the unchanged tree. Acceptance does not name any test the Build adds. (decision: D2, round 1) (evidence: core/util.go) (source: request)
- No production change and no change to the encoding options or callers. (decision: D3, round 1) (constraint: core/util.go remains identical to HEAD) (evidence: core/util.go) (source: request)
- Add direct EncodeJSON tests to core/util_test.go; acceptance by mutation of a scratch copy of core/util.go. (decision: D1, round 1) (constraint: core/util.go stays identical to HEAD) (evidence: core/util.go; core/util_test.go) (assumption: Local scratch run showed each mutant fails the correct tests; Kogen readiness is authoritative.) (source: request)

## Source comparison
- Addressed: request acceptance 1 (HTML-sensitive characters preserved, no final newline, exact byte comparison) maps to the "escapes HTML characters" and "keeps the final newline" scenarios.
- Addressed: request acceptance 2 (an unrepresentable value returns an error) maps to the "swallows the encoding error" scenario.
- Addressed: scope core/util_test.go only and out of scope changing encoding options or callers, via the unchanged core/util.go check in every scenario.

## Tests
- HTML-sensitive characters are preserved and no final newline is returned: add a test calling EncodeJSON and comparing the exact string (unit)
- A value JSON cannot represent returns an error: add a test calling EncodeJSON with a channel and asserting a non-nil error (unit)

## Feasibility
- none
