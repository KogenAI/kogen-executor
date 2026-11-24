# Add direct HashHex known-vector tests

Slug: core-hashhex-test-vectors
Model: not applicable — adding stateless digest assertions introduces no meaningful state
Acceptance:
- .kogen/intents/core-hashhex-test-vectors/acceptance.feature
- features/steps/core-hashhex-test-vectors__steps.js
- features/steps/core-hashhex-test-vectors__driver/main.go

Add direct known-output tests of HashHex in core/util_test.go. Compare the entire hexadecimal digest against fixed known SHA-256 vectors for a representative non-empty input and empty bytes. Preserve existing useful tests. Do not change HashHex, add dependencies, or edit other production/test files. The acceptance observer runs the real utility test file against unchanged code and temporary same-length incorrect-digest mutations; those mutations are proof artifacts only, not delivered changes.

Original request:
> Evidence: ev-eb380459 In core/util.go, HashHex returns the SHA-256 digest of its input as hexadecimal text. core/util_test.go has direct tests for several neighboring helpers, but no test calls HashHex.
>
> Expected: Add direct tests that pin HashHex to known SHA-256 outputs.
>
> Scope: core/util_test.go. Out of scope: changing HashHex or adding dependencies.
>
> Acceptance:
> 1. A known non-empty input produces its standard SHA-256 hexadecimal digest. Wrong-implementation: checking only the output length would miss an incorrect digest.
> 2. Empty input produces the standard SHA-256 digest of empty bytes. Wrong-implementation: testing only non-empty data would leave the empty-input case unchecked.

## Decisions
- Keep implementation changes confined to core/util_test.go, adding direct tests without changing HashHex or adding dependencies. (decision: D1, round 1) (evidence: core/util.go; core/util_test.go) (source: request)
- Use the standard short non-empty vector and the empty-byte vector specified in acceptance.feature, comparing complete fixed digest text rather than length or a dynamically computed oracle. (decision: D2, round 1) (assumption: The standard short non-empty vector is a representative known input for the requested direct tests.) (source: request)

## Source comparison
- Addressed: request evidence ev-eb380459 identifies the absent direct HashHex coverage in core/util_test.go; the proposed unit tests and both acceptance scenarios require a direct call and known digest text, then exercise those tests with the real utility source.
- Addressed: request acceptance 1 requires a known non-empty SHA-256 digest and warns that output-length checks are insufficient; acceptance.feature's non-empty scenario rejects a same-length incorrect digest, and controls.json supplies a length-only wrong test implementation.
- Addressed: request acceptance 2 requires the empty-byte SHA-256 digest and warns against non-empty-only coverage; acceptance.feature's empty scenario rejects an empty-only incorrect digest, and controls.json supplies a non-empty-only wrong test implementation.
- Addressed: request scope core/util_test.go and exclusions changing HashHex or adding dependencies are preserved in the outcome and D1. The observer mutates only scratch copies to verify the added tests. No requested behavior is omitted, conflicting, or superseded.

## Tests
- Non-empty known digest: add direct full-output HashHex assertions in core/util_test.go and verify they reject same-length incorrect content (unit)
- Empty-byte known digest: add a direct full-output HashHex assertion in core/util_test.go and verify it rejects an empty-only digest regression (unit)

## Feasibility
- The existing utility tests passed through the exact Go JSON runner interface used by the observer, with test run/pass and package pass events. (evidence: ran go test -json -count=1 core/util.go core/util_test.go)
- evidence: {"id":"nonempty-observer","kind":"observer","inputs":[".kogen/intents/core-hashhex-test-vectors/good.go.txt",".kogen/intents/core-hashhex-test-vectors/length-only.go.txt","core/util.go"],"observers":["features/steps/core-hashhex-test-vectors__driver/main.go"],"checks":[{"name":"good","command":"d=$(mktemp -d); trap 'rm -rf \"$d\"' EXIT; go build -o \"$d/observer\" features/steps/core-hashhex-test-vectors__driver/main.go && \"$d/observer\" abc ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad .kogen/intents/core-hashhex-test-vectors/good.go.txt","exit":0,"output":"verified\n"},{"name":"bad","command":"d=$(mktemp -d); trap 'rm -rf \"$d\"' EXIT; go build -o \"$d/observer\" features/steps/core-hashhex-test-vectors__driver/main.go && \"$d/observer\" abc ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad .kogen/intents/core-hashhex-test-vectors/length-only.go.txt","exit":1,"output":"same-length incorrect digest survived for input \"abc\"\n"}]}
- evidence: {"id":"empty-observer","kind":"observer","inputs":[".kogen/intents/core-hashhex-test-vectors/good.go.txt",".kogen/intents/core-hashhex-test-vectors/nonempty-only.go.txt","core/util.go"],"observers":["features/steps/core-hashhex-test-vectors__driver/main.go"],"checks":[{"name":"good","command":"d=$(mktemp -d); trap 'rm -rf \"$d\"' EXIT; go build -o \"$d/observer\" features/steps/core-hashhex-test-vectors__driver/main.go && \"$d/observer\" '' e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 .kogen/intents/core-hashhex-test-vectors/good.go.txt","exit":0,"output":"verified\n"},{"name":"bad","command":"d=$(mktemp -d); trap 'rm -rf \"$d\"' EXIT; go build -o \"$d/observer\" features/steps/core-hashhex-test-vectors__driver/main.go && \"$d/observer\" '' e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 .kogen/intents/core-hashhex-test-vectors/nonempty-only.go.txt","exit":1,"output":"same-length incorrect digest survived for input \"\"\n"}]}
