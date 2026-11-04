# Show denied Claude Code tool calls

Slug: k-exec-permission-denials-visible
Model: not applicable — bounded result telemetry is a stateless projection; session lifecycle remains unchanged
Acceptance:
- .kogen/intents/k-exec-permission-denials-visible/acceptance.feature
- features/steps/k-exec-permission-denials-visible__steps.js

Expose Claude Code result permission denials on executor_round_ended and executor_round_failed whenever a result line exists. Replace count-only telemetry without changing permissions, ending, reason, usage, or session behavior. Read result permission_denials entries using tool_name, tool_use_id and tool_input. Emit permission_denial_calls objects with name, optional tool_use_id, and arguments (null for absent/non-object input). Preserve order. Valid entries are objects with a nonempty string tool_name; skip others. Include only string tool_use_id when supplied. Use a fixed cap of 32 valid entries. permission_denials remains the raw array length including malformed entries; permission_denials_omitted is total minus emitted length, including skipped entries. For an empty array emit an empty list and omitted 0; for absent/non-array permission_denials omit the new list and omitted fields, retaining existing count behavior. Failed events with a result also receive the total count.

Redact stored tokens before any telemetry projection. Use the same redaction and bounds as executor_tool.arguments for inputs, additionally ensuring secret-named JSON argument values such as api_key are replaced with [redacted] (fix the shared argument sanitizer if necessary so both surfaces agree). Preserve nonsecret JSON types. Redact/bound name and id string values as well so metadata cannot leak a stored token. Existing string bounds are 4096 bytes with 256-byte UTF-8-safe head, and whole arguments bound is 65536 encoded bytes; preserve size/hash semantics after redaction. No live provider runs or new permission settings.

## Decisions
- Show denial names, optional IDs and sanitized inputs on both terminal event types, with true total and omitted counts (source: request)

## Source comparison
- Addressed request Problem and Need: count-only behavior in stream.go becomes the bounded projection above and is wired into session.go failed-event emission; no permission policy or result semantics change. The unspecified fixed cap is settled at 32; entry keys follow executor_tool.
- Addressed synthetic examples 1–5 in acceptance: WebFetch URL plus unknown tool without input; 200 entries; api_key s3cret and stored-token redaction; non-object counted but skipped; absent key omits list. Added explicit empty and cap-adjacent cases and failed result coverage, not a scope replacement.
- Addressed README/testing rules: local fake Claude through adapter.Start/Session.Round, plus focused sanitizer/projection tests during implementation; configured checks remain unchanged. No requested behavior omitted or superseded.

## Tests
- Project ordered valid denials and optional IDs/inputs: add focused projection tests and synthetic adapter scenario (integration).
- Bound at 32 and count all raw entries including malformed ones: test 31, 32, 33, 200, empty and mixed malformed arrays (unit).
- Redact stored tokens and secret-named arguments and preserve existing string/whole-object bounding rules: extend arguments tests for JSON secret keys and denial projection at 4095/4096/4097 and 65535/65536/65537 encoded bytes after redaction (unit).
- Attach telemetry to successful and failed results without altering ending/reason/usage: synthetic result scenarios plus paired with/without-denials tests comparing RoundResult, errors and usage (regression).
- Omit new fields when no array is supplied: absent and non-array cases (unit).

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-permission-denials-visible__steps.js"],"observers":["features/steps/k-exec-permission-denials-visible__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-permission-denials-visible__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-permission-denials-visible__steps.js bad","exit":1,"output":"observer rejected bad\n"}]}
