# Test EncodeJSON output and error behavior

Slug: core-encode-json-contract-tests
Model: not applicable — this adds regression assertions for a stateless encoding function
Acceptance:
- .kogen/intents/core-encode-json-contract-tests/acceptance.feature
- features/steps/core-encode-json-contract-tests__steps.js
- features/steps/core-encode-json-contract-tests__driver/main.go

Add direct regression coverage of EncodeJSON's documented output and error behavior in core/util_test.go. Preserve the existing useful tests and complete the successful-output test with decoding and equality assertions. Do not change JSON encoding behavior, core/util.go, or callers. No existing behavior is replaced or removed.

## Decisions
- Limit implementation edits to core/util_test.go; JSON encoding behavior and callers are out of scope. (decision: D1, round 1) (evidence: core/util.go; core/util_test.go) (source: request)
- Encoding a value containing HTML-sensitive characters preserves them literally in the JSON bytes. (decision: D2, round 1) (evidence: core/util.go; core/util_test.go) (source: request)
- Successful encoding has no trailing newline and decodes to the original value. (decision: D3, round 1) (evidence: core/util.go; core/util_test.go) (source: request)
- An unsupported value returns an error instead of successful output. (decision: D4, round 1) (evidence: core/util.go; core/util_test.go) (source: request)
- Retain the existing exact-output and unsupported-channel tests; extend successful direct EncodeJSON coverage with assertions that decoding succeeds and the decoded value equals the original input, without requiring a particular decoding API or equality mechanism. (decision: D6, round 1) (evidence: core/util.go; core/util_test.go) (revises: D5 because contract feedback identified an unnecessary decoding API and equality mechanism mandate) (source: request)

## Source comparison
- Addressed: Request evidence ev-69fcd661 identifies core/util.go's EncodeJSON documentation and asks for direct regression tests in core/util_test.go. The outcome, Decisions D1–D4 and D6, and all acceptance scenarios retain that test-only scope and all three required behaviors.
- Superseded baseline observation, not superseded product scope: the request says core/util_test.go has no direct EncodeJSON test. At the inspected revision, core/util_test.go already contains TestEncodeJSONKeepsHTMLCharactersAndOmitsFinalNewline and TestEncodeJSONReturnsErrorForUnrepresentableValue. Preserve these useful assertions rather than duplicate them; the missing explicit decoding/round-trip assertions are added to the success test.
- Addressed: acceptance.feature retains the current concrete HTML example and unsupported channel, and names all supplied counterexamples: default HTML escaping, retaining Encoder.Encode's newline, invalid JSON, and suppressing the encoder error. Its direct-decoding scenario checks that the requested decode test exists; its mutation scenarios run the actual core/util_test.go assertions against scratch-only variants of EncodeJSON.
- Addressed: the scope exclusion of production encoding changes and caller changes remains explicit in the outcome and D1. The scratch mutation harness does not modify the working tree. Omitted requested behavior: none. Conflicting requested behavior: none.

## Tests
- Literal HTML-sensitive characters: preserve the exact JSON byte assertion in the direct successful EncodeJSON test and verify it detects default HTML escaping (regression)
- Successful output omits a trailing newline and decodes to the original value: preserve exact bytes, add successful-decoding and decoded-value equality assertions, and verify newline and invalid-JSON regressions are rejected (regression)
- Unsupported input returns an error: retain the unsupported-channel assertion and verify it rejects a suppressed encoder error (regression)

## Feasibility
- The project's file-scoped Go test command ran the existing utility tests successfully, including both existing direct EncodeJSON tests; its JSON event stream includes per-test run/pass and package pass records. (probe: go test -json -count=1 core/util.go core/util_test.go; exit 0)
- The generated observer uses go/parser to recognize decoding calls in a direct test (including Decode and Unmarshal forms) and real file-scoped Go tests for mutations. Known-good and known-bad fixtures below qualify the final observer bytes; the bad fixture reaches the final encoder-error mutation after passing the baseline, HTML, newline and invalid-JSON checks.
- evidence: {"id":"encode-json-observer","kind":"observer","inputs":["core/util.go",".kogen/intents/core-encode-json-contract-tests/good_test.go.txt",".kogen/intents/core-encode-json-contract-tests/bad_test.go.txt"],"observers":["features/steps/core-encode-json-contract-tests__driver/main.go"],"checks":[{"name":"good","command":"d=$(mktemp -d); trap 'rm -rf \"$d\"' EXIT; go build -o \"$d/observer\" features/steps/core-encode-json-contract-tests__driver/main.go && \"$d/observer\" all .kogen/intents/core-encode-json-contract-tests/good_test.go.txt","exit":0,"output":"verified\n"},{"name":"bad","command":"d=$(mktemp -d); trap 'rm -rf \"$d\"' EXIT; go build -o \"$d/observer\" features/steps/core-encode-json-contract-tests__driver/main.go && \"$d/observer\" all .kogen/intents/core-encode-json-contract-tests/bad_test.go.txt","exit":1,"output":"error mutation survived\n"}]}
