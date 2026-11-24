# Reject trailing conformance script JSON

Slug: conformance-reject-trailing-script-json
Model: not applicable — this is stateless validation of one embedded file's bytes
Acceptance:
- .kogen/intents/conformance-reject-trailing-script-json/acceptance.feature
- features/steps/conformance-reject-trailing-script-json__steps.js
- features/steps/conformance-reject-trailing-script-json__driver/main.go

Reject an embedded conformance script unless its file contains exactly one JSON value followed only by whitespace. Replace the current first-value-only decoding behavior, not the script schema or script behavior. Accept a valid object followed by whitespace; reject a second JSON value or non-whitespace garbage with an error naming the script file. Implementation and regression-test edits are limited to executor/conformance/conformance.go and executor/conformance/scripts_test.go. Do not change the embedded scripts.

## Decisions
- Reject an embedded conformance script unless its file contains exactly one JSON value followed only by whitespace. (decision: D1, round 1) (evidence: executor/conformance/conformance.go; executor/conformance/scripts_test.go) (source: request)
- Keep script behavior and embedded scripts unchanged; limit implementation and regression-test changes to executor/conformance/conformance.go and executor/conformance/scripts_test.go. (decision: D2, round 1) (evidence: executor/conformance/conformance.go; executor/conformance/scripts_test.go) (source: request)
- Preserve existing unknown-field rejection, filename/name matching, and name-sorted loading while rejecting trailing content with an error naming the script file; no particular error wording beyond the filename is required. (decision: D3, round 1) (evidence: executor/conformance/conformance.go; executor/conformance/scripts_test.go) (source: request)

## Source comparison
- Addressed: Request Expected and Acceptance 1 are implemented by the single-value rule and the acceptance scenario "Accept a single object followed by whitespace". Its JSON-encoded input retains space, tab, carriage return and newline bytes; the positive check rejects an implementation that forbids valid trailing whitespace.
- Addressed: Request Acceptance 2 and its wrong-implementation example map to "Reject a second JSON value" and its filename-bearing error assertion. The controls include both first-value-only decoding and omission of the filename.
- Addressed: Request Acceptance 3 and its wrong-implementation example map to "Reject non-whitespace garbage" and its filename-bearing error assertion. The controls include ignoring the second decode's syntax error.
- Addressed: Request Scope is retained verbatim as the two permitted implementation paths in the outcome and D2; script behavior and embedded scripts remain out of scope. Acceptance makes isolated fixture copies only, leaving the actual embedded files unchanged.
- Superseded: Evidence ev-6e569aa8 reports decoding once without checking for a second value or trailing content. The current decoder at executor/conformance/conformance.go and load-only check in executor/conformance/scripts_test.go confirm that gap. The new strict end-of-input rule supersedes that behavior, and focused regression tests must cover the three requested cases while retaining useful existing tests.
- Omitted: no requested behavior or settled non-secret literal. There are no conflicting scope changes.

## Tests
- Accept one valid object followed only by whitespace: add a focused positive parsing check in executor/conformance/scripts_test.go and exercise Scripts through the isolated compiled driver (regression)
- Reject a second JSON value and name its script file: add a reproducing parsing check in executor/conformance/scripts_test.go and assert the public Scripts error (regression)
- Reject non-whitespace garbage and name its script file: add a reproducing parsing check in executor/conformance/scripts_test.go and assert the public Scripts error (regression)
- Preserve embedded script loading and existing schema/name validation: retain TestScriptsParse and the other useful existing conformance tests (existing)
- none: The changed rule validates one file's bytes, not a record-collection operation with per-record data-store or external-service work.

## Feasibility
- evidence: {"id":"loader-observer","kind":"observer","inputs":["features/steps/conformance-reject-trailing-script-json__steps.js","features/steps/conformance-reject-trailing-script-json__driver/main.go"],"observers":["features/steps/conformance-reject-trailing-script-json__steps.js","features/steps/conformance-reject-trailing-script-json__driver/main.go"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/conformance-reject-trailing-script-json__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/conformance-reject-trailing-script-json__steps.js bad","exit":1,"output":"observer rejected bad controls\n"}]}
