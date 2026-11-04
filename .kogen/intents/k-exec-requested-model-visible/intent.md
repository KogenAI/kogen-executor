# Report requested and observed round models

Slug: k-exec-requested-model-visible
Model: not applicable — this is observation-only event projection, not a new session state machine
Acceptance:
- .kogen/intents/k-exec-requested-model-visible/acceptance.feature
- features/steps/k-exec-requested-model-visible__steps.js

Add requested_model and model attribution to every executor_round_ended and executor_round_failed emitted by the Claude Code adapter. requested_model is always present, from Task.Model (empty string when unspecified). model is from this round's stream init, absent if no init was received; never substitute the requested model or a prior round's observed model. Preserve executor_started and existing argv behavior. No mismatch enforcement, new failure, ending, reason, usage accounting, or model selection changes.

Use the existing bound(text, 256) convention for both event fields (256-byte prefix on a rune boundary plus the existing ellipsis for truncation), with existing credential redaction before bounding. Do not change raw task model forwarded to --model or raw usage calculations. Reuse the adapter's existing secret-redaction path; these fields must not leak credentials. Do not log auth/config payloads.

## Decisions
- An alias resolving to a different full model id is observational information only, not an error. (source: request)
- No requested model is represented as requested_model: "" and still omits --model from argv. (source: request)
- Failure before init omits model rather than inventing a value. (source: request)

## Source comparison
- Addressed: the problem's missing attribution on ended/failed events is covered by the outcome above and every acceptance example; existing executor_started behavior is preserved.
- Addressed: synthetic examples 1–4 are executable rows using alias-a, full-id-a, an error result after init, exit 1 without stream, and an empty requested model. The 5 kB init string in example 5 is expanded by the owned step's LONG input to 5000 ASCII bytes; the extra LONG requested row covers the same event-text bound on the other new field.
- Addressed: observation only, unchanged ending/reason/usage and no secrets are explicit implementation requirements. The acceptance observer checks finish and usage input 120, cached 20, output 30 from the actual finishRound fixture; credential redaction also needs focused implementation regression coverage.
- Superseded: the delivery report's claimed observer expectation of input 140 is not the desired behavior. Repository adapter_test.go defines finishRound input 120 including cached 20, confirmed by its existing accounting comment. The new observer expects 120, never asks production to change accounting, and its bad control deliberately supplies 140 to ensure rejection. The BUILDER-REPORTED contradiction is historical evidence, not authorization to edit protected files in a Build.
- Omitted: no requested product behavior. No live provider invocation, alias catalog, fallback detection, mismatch policy, or additional event types are added.

## Tests
- Ended event includes requested and observed models without rejecting alias resolution: fake Claude integration acceptance and focused adapter regression (integration)
- Failed event after init includes both fields with unchanged failure reason: error-result acceptance row (integration)
- Failed event before init contains requested_model but no model: exit-1 acceptance row (integration)
- Empty Task.Model emits an empty requested_model and no --model flag: acceptance argv assertion (integration)
- Both fields use bounded event text and existing redaction: LONG acceptance rows plus focused unit tests at 255, 256 and 257 bytes, rune boundary and credential-bearing text (unit)
- Usage remains input 120, cached 20, output 30 for finishRound rather than the previous erroneous 140 expectation: real fixture observer and its negative control (regression)
- Existing session lifecycle, usage and error handling remain unchanged: configured Go checks (existing)

## Feasibility
- evidence: {"id":"receipt-observer","kind":"observer","inputs":["features/steps/k-exec-requested-model-visible__steps.js"],"observers":["features/steps/k-exec-requested-model-visible__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-requested-model-visible__steps.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-requested-model-visible__steps.js bad","exit":1,"output":"observer rejected\n"}]}
