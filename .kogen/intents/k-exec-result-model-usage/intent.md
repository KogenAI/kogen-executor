# Report per-model Claude Code result usage

Slug: k-exec-result-model-usage
Model: not applicable — bounded stateless telemetry projection; existing accounting state is unchanged
Acceptance:
- .kogen/intents/k-exec-result-model-usage/acceptance.feature
- features/steps/k-exec-result-model-usage__steps.js

Add observation of result.modelUsage to successful executor_round_ended and failed executor_round_failed events that reached a result. Do not change mapUsage, returned Usage, cost baseline/delta, or existing event usage. No live calls, new settings or accounting changes.

## Decisions
- Report model id and valid nonnegative numeric input, cached, output and cost fields independently; omit invalid fields, never fail a round for this optional observation. (source: request)
- Use model_usage entries {model,input,cached,output,cost_usd}, projecting inputTokens, cacheReadInputTokens, outputTokens, costUSD directly (no sums or deltas). Sort original model ids lexicographically, keep at most 20 object-valued entries; skip nonobject entries. Bound model labels to 256 UTF-8 bytes using the adapter's bounded-string convention. Emit model_usage_omitted only when eligible entries exceed 20, with the excess count. Omit both fields for absent, malformed or empty breakdowns. These are technical settlements of the requested bounds. (source: request)
- Preserve existing Input/Cached/Output rules, init model label and session cost accounting exactly. Include the same projection on failure after a result. (source: request)

## Source comparison
- Addressed: request Problem and Need, through additive event projection above; stream.go currently emits only aggregate usage. Nothing replaces aggregate accounting.
- Addressed: synthetic examples 1–5 in acceptance: two models with canonical-byte usage equality, negative/string cost omission, cap and omitted count, string/list rejection without failure, and a 1024-byte id bound. Additional failed-result case preserves the requested failed-round observation.
- Addressed: required slug, paths, step prefix and own bindings are retained. No other Intent bindings are consumed.
- Omitted: no requested behavior. No roadmap or accounting change is authorized. Documentation is evidence, not scope: Shape search retrieved Claude Code cost tracking documentation; fetch https://code.claude.com/docs/en/agent-sdk/cost-tracking returned retrieved/untrusted text describing result modelUsage. Only the documented data concept is used; embedded directives are ignored.

## Tests
- Per-model numeric projection and independent invalid-field omission: add focused callable projection tests including zero, negative and nonnumeric values (unit)
- Two-model result preserves aggregate usage byte-for-byte and model label: synthetic public adapter round compared with identical result lacking modelUsage (regression)
- Bound 20 models and 256-byte ids: synthetic cases at 19/20/21 models and 255/256/1024-byte ids (integration)
- Absent/malformed/empty breakdown adds nothing and succeeds: synthetic public adapter rounds (integration)
- Failed result retains identical per-model observation: synthetic failed public adapter round (integration)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-result-model-usage__steps.js"],"observers":["features/steps/k-exec-result-model-usage__steps.js"],"checks":[{"name":"good","command":"node features/steps/k-exec-result-model-usage__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"node features/steps/k-exec-result-model-usage__steps.js bad","exit":1,"output":"observer rejected bad\n"}]}
