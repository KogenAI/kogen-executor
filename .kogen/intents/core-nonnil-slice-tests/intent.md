# Add direct NonNil slice tests

Slug: core-nonnil-slice-tests
Model: not applicable — focused stateless slice-helper test coverage has no meaningful state
Acceptance:
- .kogen/intents/core-nonnil-slice-tests/acceptance.feature
- features/steps/core-nonnil-slice-tests__steps.js

Close evidence gap ev-6acaddc1 by adding direct tests for the exported NonNil helper in core/util_test.go. Pin the nil result's non-nilness and zero length, and populated input's elements and order. Keep useful existing tests. This adds coverage rather than replacing helper behavior; implementation changes are confined to core/util_test.go. Do not change NonNil or JSON serialization behavior elsewhere.

## Decisions
- Passing a nil slice returns a non-nil slice with length zero; length alone is insufficient. (source: request)
- Passing a populated slice preserves its elements and order; testing only the nil case is insufficient. (source: request)
- Scope is core/util_test.go. Changing NonNil or changing JSON serialization behavior elsewhere is out of scope. (source: request)
- Validate the added tests by running core/util_test.go with core/util.go in scratch copies and requiring assertion failures for incorrect NonNil results. (decision: D1, round 1) (evidence: core/util.go; core/util_test.go) (source: request)

## Source comparison
- Addressed: request evidence ev-6acaddc1 and expected direct coverage of NonNil map to the outcome above and both acceptance.feature scenarios. The current core/util.go implements the requested behavior, while core/util_test.go lacks direct coverage; this is a test-only addition, not a production fix.
- Addressed: acceptance item 1 maps to the nil scenario, which rejects both a nil-preserving implementation and a nonempty result for nil. Its supplied counterexample, a length-only assertion allowing a nil slice that can encode as JSON null, is executable through observer-length-only.go.txt and the corresponding controls.json wrong implementation.
- Addressed: acceptance item 2 maps to the populated scenario, which rejects always-empty, reversed-order, and element-dropping implementations. The supplied always-empty counterexample passing only nil coverage is exercised with observer-nil-only.go.txt and controls.json.
- Addressed: requested implementation scope core/util_test.go and exclusions for NonNil and JSON serialization elsewhere remain unchanged. Scratch mutations are proof only and are never delivered as production edits. No requested behavior is omitted, conflicting, or superseded.

## Tests
- Nil slices yield non-nil zero-length slices: add a direct NonNil unit case in core/util_test.go that checks both properties; acceptance rejects nil-preserving and nonempty-for-nil scratch mutations (unit)
- Populated slices preserve elements and order: add a direct NonNil unit case in core/util_test.go comparing the complete result in order; acceptance rejects always-empty, reversed, and dropped-element scratch mutations (unit)

## Feasibility
- The unchanged utility test file passes with the file-scoped go test command, and a real existing test emits Go JSON run/pass and package pass events. (probe: exit 0)
- evidence: {"id":"nil-observer","kind":"observer","inputs":[".kogen/intents/core-nonnil-slice-tests/observer-good.go.txt",".kogen/intents/core-nonnil-slice-tests/observer-length-only.go.txt","core/util.go"],"observers":["features/steps/core-nonnil-slice-tests__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/core-nonnil-slice-tests__steps.js nil .kogen/intents/core-nonnil-slice-tests/observer-good.go.txt","exit":0,"output":"verified\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/core-nonnil-slice-tests__steps.js nil .kogen/intents/core-nonnil-slice-tests/observer-length-only.go.txt","exit":1,"output":"nil-preserving implementation survived\n\ntrue !== false\n\n"}]}
- evidence: {"id":"populated-observer","kind":"observer","inputs":[".kogen/intents/core-nonnil-slice-tests/observer-good.go.txt",".kogen/intents/core-nonnil-slice-tests/observer-nil-only.go.txt","core/util.go"],"observers":["features/steps/core-nonnil-slice-tests__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/core-nonnil-slice-tests__steps.js populated .kogen/intents/core-nonnil-slice-tests/observer-good.go.txt","exit":0,"output":"verified\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/core-nonnil-slice-tests__steps.js populated .kogen/intents/core-nonnil-slice-tests/observer-nil-only.go.txt","exit":1,"output":"always-empty implementation survived\n\ntrue !== false\n\n"}]}
