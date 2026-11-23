# Test diagnostic text extraction

Slug: test-diagnostic-text-extraction
Model: not applicable — the helpers are pure functions with no meaningful state
Acceptance:
- .kogen/intents/test-diagnostic-text-extraction/acceptance.feature
- features/steps/test-diagnostic-text-extraction__steps.js

Add focused tests in core/util_test.go for the content shapes that DiagnosticText and MaterialText in core/util.go support. String content is returned unchanged; a list of text blocks returns the text of the recognized blocks joined by one newline; non-map blocks, maps without string text and unsupported content shapes contribute no text. Only core/util_test.go changes. Out of scope: changing diagnostic formats, changing core/util.go or adding new block types.

## Decisions
- Only core/util_test.go is edited; core/util.go behavior stays exactly as it is and no new block types are added. (decision: D1, round 1) (evidence: core/util.go; core/util_test.go) (source: request)
- String content is returned unchanged, and a list containing multiple text blocks returns their text joined by exactly one newline. (decision: D2, round 1) (evidence: core/util.go) (source: request)
- Non-map blocks, maps without string text and unsupported content shapes (a number, a map, a non-[]any list, missing content, a non-map item) never contribute text; malformed blocks between valid text blocks leave only the valid text, joined by one newline. (decision: D3, round 1) (evidence: core/util.go) (source: request)
- Acceptance judges the tests by running the core package tests against the current tree and against wrong copies of core/util.go made in a temporary directory outside the checkout; the checkout's production files are never modified. (decision: D4, round 1) (evidence: core/util_test.go) (assumption: mutation-style acceptance of a tests-only change is acceptable) (source: request)

## Source comparison
- Addressed: acceptance 1 (string unchanged, multiple text blocks joined by one newline) maps to the scenario with the wrong implementations that treat string content as blocks or join without a separator.
- Addressed: acceptance 2 (non-map blocks, maps without string text, unsupported content shapes contribute no text) maps to the scenario with the wrong implementations that coerce each of those into text.
- Addressed: the scope limit core/util_test.go; no change to diagnostic formats or block types.

## Tests
- DiagnosticText returns string content unchanged and joins multiple text blocks with one newline: add a table-driven test of DiagnosticText in core/util_test.go (unit)
- Malformed blocks and unsupported content shapes contribute no text, leaving partial results from valid blocks: add cases to the DiagnosticText table in core/util_test.go (unit)
- MaterialText returns text only for a map with a string text value: add a table-driven test of MaterialText in core/util_test.go (unit)

## Feasibility
- none
