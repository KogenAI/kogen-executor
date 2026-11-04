# Accept benign events after round results

Slug: k-exec-benign-events-after-result
Model: .kogen/intents/k-exec-benign-events-after-result/model.qnt invariants=Preserved,Bounded,FailureAfterResult seed=17 samples=100 steps=20
Acceptance:
- .kogen/intents/k-exec-benign-events-after-result/acceptance.feature
- features/steps/k-exec-benign-events-after-result__steps.js

Replace the blanket post-result rejection in executor/claudecode/stream.go with a fixed allowlist: system/hook_started, system/hook_response, system/plugin_install, and rate_limit_event. A result is still terminal for content. An accepted tail must preserve the completed claim, ending, structured submission and usage. Rate limit tails use the existing rate-limit snapshot handling, including its field bounds and latest valid snapshot behavior. No provider calls, runtime update, new settings, lifecycle changes, or broader tolerance are requested.

## Decisions
- Accept exactly the four non-content event kinds specified above after a result; reject everything else, including malformed JSON and non-object JSON (source: request).
- Preserve round end, kill grace and drain behavior; acceptance uses fake Claude Code streams through the public Start/Round boundary (source: request).
- Report accepted trailing events in the round profile as `events_after_result`, omitted at zero, saturated at 2147483647. This technical settlement of the requested bounded count is an observation-only scalar, not a reason to continue waiting. Include it wherever addProfile reports the round profile. Rejected lines do not increment it (source: request).
- All invalid post-result lines use executor/protocol with exact detail `the event stream continued after its result`. Before a result, existing malformed-line diagnostics remain unchanged (source: request).

## Source comparison
- Addressed: Request Problem/Need's lost completed claim and usage: allowlist dispatch replaces stream.go:127-129's unconditional error; successful-tail scenarios compare returned and terminal usage with a no-tail round and assert the claim `done`.
- Addressed: Need's fixed literals `system` with `hook_started`, `hook_response`, `plugin_install`, and `rate_limit_event`: each has an executable successful case; mixed tails prove accumulation and the last rate-limit snapshot.
- Addressed: Synthetic acceptance 1 and 2: init, assistant text, success result, then hook_response or rate_limit_event run through the real adapter, asserting one event after result, unchanged claim/usage and snapshot.
- Addressed: Synthetic acceptance 3, 4, 5 and Need's user/unknown/malformed exclusions: failure outline asserts protocol reason and the exact continued-after-result message for each, including valid non-object JSON and invalid JSON.
- Superseded: stream.go currently decodes malformed JSON before checking for an existing result, yielding a different diagnostic. The request explicitly requires post-result invalid lines to retain the continued-after-result message; only this post-result case changes.
- Addressed: unchanged lifecycle scope uses existing TestLingeringProcessAfterResultIsStopped and existing cancellation/drain coverage; no lifecycle code redesign. No requested behavior or supplied reproducer is omitted.
- Addressed: requested slug, paths, direct steps naming and step sentence prefix are retained in this complete package. README/testing policy and configured checks remain in force; unrelated historical controls in the supplied policy do not expand this local adapter fix.

## Tests
- Benign post-result hooks preserve completed outputs: add a fake-stream regression covering each allowed system subtype and no-tail comparison (regression).
- Rate limit tails update the existing bounded snapshot and count: add fake-stream tests for one and multiple tails, comparing usage and latest snapshot (integration).
- Any other post-result line is a protocol failure with the exact current continued-after-result message: expand TestEventAfterResultIsProtocolFailure for second result, assistant, user, unknown type, other system subtype, malformed JSON and non-object JSON (regression).
- Profile count accumulates only accepted tails and saturates: add focused count tests at zero, one, 2147483646, 2147483647 and a further increment; assert terminal profile reporting (unit).
- Round termination, kill and drain semantics remain unchanged: preserve existing adapter lifecycle tests including TestLingeringProcessAfterResultIsStopped (existing).

## Feasibility
- Model typecheck passed with Quint (probe: exit 0, 0.5 s). An initial nonexistent-path invocation failed and established nothing. A scratch attempt to copy private proposals failed because they are not included in probe trees; final observer commands below execute on the submitted bytes during readiness instead.
- The fixed allowlist is a requested local protocol policy, not a dependency on the behavior of a live provider version; no external documentation lookup or paid probe is needed.
- evidence: {"id":"tail-observer","kind":"observer","inputs":["features/steps/k-exec-benign-events-after-result__steps.js"],"observers":["features/steps/k-exec-benign-events-after-result__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-benign-events-after-result__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-benign-events-after-result__steps.js bad","exit":1,"output":"observer bad rejected\n"}]}
