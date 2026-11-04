# Record context compactions inside executor rounds

Slug: k-exec-context-reset-events
Model: .kogen/intents/k-exec-context-reset-events/model.qnt invariants=Accurate seed=1 samples=100 steps=30
Acceptance:
- .kogen/intents/k-exec-context-reset-events/acceptance.feature
- features/steps/k-exec-context-reset-events__steps.js

Record Claude Code context resets as bounded metadata-only executor telemetry. Currently stream.go ignores system/compact_boundary. Replace that loss with one immediate event per accepted boundary and a per-round total on executor_round_ended. Do not change usage accounting, round success/failure, retry behavior, prompts, runtime installation or conversation storage. The emit callback is the run-log boundary in this module; no consumer repository changes are included.

## Decisions
- Each recognised valid boundary emits exactly {event: "executor_context_compacted", role: the session role, round: the current round number, trigger: the reported string, pre_tokens: the reported nonnegative integer or null}. Emit in stream order before the round end. No message text, summaries or arbitrary metadata are copied. (source: request)
- Recognise type=system, subtype=compact_boundary, object compact_metadata and a nonempty string trigger. Preserve the trigger literally, including auto and manual, without converting auto to automatic. Missing/non-object metadata or missing/non-string/empty trigger is ignored and does not count. This selects the explicitly permitted 'none' outcome for non-object metadata. Invalid or absent pre_tokens becomes null without dropping an otherwise recognised boundary. Use existing countPtr semantics for token counts. (source: request)
- executor_round_ended always adds compactions, including 0; the counter starts at zero for each round, not each session. A no-compaction stream otherwise behaves as today. Malformed here means malformed compaction fields inside otherwise valid stream JSON; existing protocol rules for invalid JSON, init ordering and events after result remain unchanged. No new failed-round telemetry is required. (source: request)

Protocol settlement: the current Anthropic Agent SDK TypeScript reference at https://platform.claude.com/docs/en/agent-sdk/typescript was retrieved (untrusted page data) and its SDKCompactBoundaryMessage declaration reports type system, subtype compact_boundary, compact_metadata {trigger: "manual" | "auto", pre_tokens: number}, plus uuid/session_id. The synthetic stream uses that wire shape, relaxing missing count per the request. Search lookups returned irrelevant results, and the .md variant returned not_found for the searched terms; they are not claimed as protocol evidence. No live provider call is necessary.

## Source comparison
- Addressed: Problem and Need, each announcement with role/round/trigger/pre-count, and round-end count map to Decisions 1–3 and the two-boundary scenario. Existing final usage is preserved, not replaced.
- Addressed: Synthetic acceptance two boundaries (automatic with a count, one without), no boundaries/0, non-object metadata succeeding with none, and JSON without message text are executable in acceptance.feature and the shared verifier. Actual wire auto is retained as reported rather than the prose example automatic.
- Addressed: unrecognised/malformed compactions counted nowhere and never fail the round map to the final two scenarios; no-compaction behavior is unchanged except the explicitly required compactions:0 key. This resolves the apparent literal conflict between 'exactly as today' and the required new zero field.
- Omitted: no requested behavior. No UI, settings, network runs, consumer displays or unrelated historical work are added. The requested slug, Intent paths, direct step filename prefix and binding prefix are preserved.

## Tests
- Emit one ordered metadata-only event per recognised boundary: synthetic real-adapter stream scenario plus focused stream decoding tests to add (integration)
- Retain absent counts as null and literal triggers: two-boundary scenario and focused count parsing tests to add (unit)
- Count zero for none and reset the count for each later round: empty-stream scenario and a two-round adapter regression to add (regression)
- Ignore malformed/unrecognised compaction fields without failing: malformed synthetic stream scenarios (integration)
- Never copy conversation text to event JSON: exact event-object and whole-log secret-sentinel assertions (regression)
- Preserve existing usage/protocol/error behavior other than the new telemetry: existing adapter and contract suites (existing)

## Feasibility
- Quint model typechecked with the configured Quint executable in a scratch probe: exit 0, 0.4 s. It models per-round emitted/count correspondence, ignored input and reset.
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-context-reset-events__steps.js"],"observers":["features/steps/k-exec-context-reset-events__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-context-reset-events__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-context-reset-events__steps.js bad","exit":1,"output":"observer bad rejected\n"}]}
