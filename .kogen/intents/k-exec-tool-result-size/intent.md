# Record executor tool result sizes

Slug: k-exec-tool-result-size
Model: not applicable — per-result telemetry is a stateless transformation; existing hook/session state semantics are unchanged
Acceptance:
- .kogen/intents/k-exec-tool-result-size/acceptance.feature
- features/steps/k-exec-tool-result-size__steps.js

Add result_bytes, result_error and result_items to every executor_tool event emitted for a completed tool call. Preserve name, tool_use_id, round, denied, arguments and rejected_before_hook semantics and event ordering. Do not log result content, snippets or digests. This replaces dropping the result's telemetry, not existing refusal enforcement.

Count UTF-8 bytes of decoded result text as received, before executor redaction or logged-text bounding (including the redaction currently preceding roundRun.line in session.go). The existing bounded stream line remains the input limit; add no new truncation setting. A string content is one result item, including an empty string. Array content has its array length as result_items, including non-text blocks; sum byte lengths only of blocks with type text and string text. Missing/null/unsupported non-array, non-string content has zero items and bytes. Images contribute no bytes. Missing is_error defaults false; otherwise retain the received boolean, independently of denied. All three fields must always be present, including zero and false. Apply this to ordinary completion, hook denial, Shape configuration denial and rejected-before-hook branches. No provider transport or protocol changes are requested.

## Decisions
- Record result size, error status and item count, never content; retain existing event meanings and refusal behavior. (source: request)
- Preserve the supplied 12,000-byte success, boom error, image/empty, guarded denial, pre-hook rejection and secret non-disclosure examples in synthetic acceptance. (source: request)

## Source comparison
- addressed: Request Problem/Need's missing result telemetry is covered by the transformation above and all examples in acceptance.feature; stream.go currently emits executor_tool in three branches without these fields and session.go redacts before parsing, so both paths need consideration.
- addressed: Request Synthetic acceptance's exact literals result_bytes 12000, result_error false, result_items 1 and boom/4/true are retained in acceptance.feature. Empty and image content retain present zero bytes; denial and rejection retain fields and prior flags; result-only secret strings must be absent from every emitted log event.
- addressed: Request requires bytes before redaction/bounding; acceptance includes a long secret-looking token and multibyte text to distinguish redacted length, character length and serialized JSON size from received text bytes.
- addressed: Request requires existing meanings unchanged; acceptance checks the complete tool event including arguments and branch flags, and Tests requires retaining existing hook/argument coverage.
- omitted: No requested behavior or settled literal is deliberately omitted. Historical unrelated testing-policy examples authorize no provider probes or unrelated changes. Technical content-shape counting above settles otherwise implicit item semantics without adding a new user setting.

## Tests
- Count received decoded text bytes and result items for string, array, image-only, absent and empty content: focused result telemetry tests plus synthetic adapter rounds (unit)
- Preserve received error booleans and emit telemetry on ordinary, denied and rejected-before-hook results: synthetic adapter rounds and focused branch regression coverage (regression)
- Count before session redaction and logged bounds without exposing result content in any event: real adapter rounds against the local scripted runtime (integration)
- Preserve prior event fields, event ordering and hook/refusal enforcement: existing argument, hook, lineup and conformance tests, updating exact event expectations only for the added telemetry (existing)

## Feasibility
- The exploratory probe could not access private proposed files in its scratch copy (exit 1); it established no capability result. Final-byte controls below run against the submitted step file, exercising a real local adapter round and independently checking deeper observer assertions using known-good and deliberately corrupted event copies. No external documentation is needed for this local telemetry change.
- evidence: {"id":"result-observer","kind":"observer","inputs":["features/steps/k-exec-tool-result-size__steps.js"],"observers":["features/steps/k-exec-tool-result-size__steps.js"],"checks":[{"name":"good","command":"node features/steps/k-exec-tool-result-size__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"node features/steps/k-exec-tool-result-size__steps.js bad","exit":1,"output":"observer rejected all bad controls\n"}]}
