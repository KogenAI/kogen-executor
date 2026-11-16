# State the scope of a round's model usage

Slug: exec-round-model-usage-states-its-scope
Model: not applicable — a stateless telemetry change: round events gain fields computed from per-model counters and a per-model baseline
Acceptance:
- .kogen/intents/exec-round-model-usage-states-its-scope/acceptance.feature
- features/steps/exec-round-model-usage-states-its-scope__steps.js
- features/steps/exec-round-model-usage-states-its-scope__driver/driver_test.go.txt

In the Claude Code executor's round events, `model_usage` is the session's total so far (from round 2 on) with `input` counting fresh input only, while `usage` on the same event is the round's own spend. Nothing on the event says so. This change makes every event that carries `model_usage` (`executor_round_ended`, and `executor_round_failed` when the round reached a result) also carry `model_usage_scope` with the exact value `session`, and `model_round_usage`: the round's own per-model figures next to it.

The two readings that mislead are: `usage.input` includes cached and cache-write tokens (`usage.cached` is the cache reads), while `model_usage.input` counts fresh input tokens only; and `usage` is a per-round delta (`session.mapUsage` and `session.usageOf` turn the cumulative `total_cost_usd` into a per-round cost delta, with a baseline that a failed round does not advance) while `model_usage` has no such baseline. This change adds the per-model baseline for `model_round_usage` only.

`model_round_usage` has one entry per model of `model_usage`, in the same order, with keys `model`, `input`, `cached`, `output`, `cost_usd` and the same meaning as in `model_usage` (`input` stays fresh input only). A field is this result's value minus the value the same model had in the session's last baseline; a model new to the session has baseline zero. Results are rounded to 9 decimal places. A field is left out when either number is missing or not a number, or when the difference is negative (then the new value becomes the baseline); an entry with no field left is left out; if no entry is left the key is left out. An event without `model_usage` has neither `model_usage_scope` nor `model_round_usage`. The baseline of each model advances only on a successful round (`executor_round_ended`); a failed round's event is computed against the last successful baseline and does not change it.

Boundaries: telemetry only. `model_usage`, `model_usage_omitted`, `usage`, the returned Usage, the cost baseline, every other event, decisions, exit codes and result.json stay exactly as they are. No new configuration, no docs or consumer-contract change. The cap of 20 models stays: entries beyond it get no `model_round_usage` entry and `model_usage_omitted` keeps counting them. The existing model-usage and cost-baseline tests and the k-exec-result-model-usage acceptance keep passing unchanged.

## Decisions
- `model_usage_scope` is added where `model_usage` is added (`addModelUsage`), so it is present exactly when `model_usage` is, with the string `session`. (evidence: executor/claudecode/stream.go; executor/claudecode/model_usage_test.go) (decision: D1, round 1) (source: request)
- The per-model baseline lives on the session (a map from the raw model id to its last successful round's field values), next to the cost baseline, and is advanced only by the `executor_round_ended` path; the failed-round path (`roundRun.addResult`) computes against it without advancing. (evidence: executor/claudecode/session.go; executor/claudecode/stream.go) (decision: D2, round 1) (source: request)
- A field is computed with the existing `number` helper (a missing, non-numeric, negative or non-finite value leaves the field out and leaves that field's baseline unchanged); a difference below zero leaves the field out and the new value becomes the baseline; differences are rounded with `math.Round(x*1e9)/1e9`. (evidence: executor/claudecode/stream.go) (decision: D3, round 1) (source: request)
- The Build adds one focused model-free Go test file in executor/claudecode next to model_usage_test.go and cost_baseline_test.go, using their fixtures: a `session` shared by several rounds, one `roundRun` per round fed result lines through `r.line` and `r.finish` as TestUnansweredHookEvents builds them, `json.Number` decoding as in model_usage_test.go, `roundRun.addResult` for the failed event as failed_round_usage_test.go calls it, and `jsonOf` to compare. (evidence: executor/claudecode/unanswered_test.go; executor/claudecode/failed_round_usage_test.go; executor/claudecode/model_usage_test.go; executor/claudecode/cost_baseline_test.go) (decision: D4, round 1) (source: request)
- Because the Build's test names do not exist before it, the acceptance scenarios run an Intent-owned Go driver (`driver_test.go.txt`) copied into the package by a `go test -overlay`, and select one scenario with the test-only environment variable RMS_SCENARIO; this adds no product setting. Its helpers are prefixed `rms` and its test is `TestRMSAcceptance`, so it cannot collide with the Build's `TestModelRoundUsage*` tests. (evidence: features/steps/bounded_guard.js; executor/claudecode/unanswered_test.go)  (decision: D5, round 1) (assumption: the user confirms the overlay-copied driver may stand in for tests the Build has to write) (source: request)

## Source comparison
- Addressed: expected 1 (`model_usage_scope` equal to `session`, absent without `model_usage`): scenarios 1, 3 and 5.
- Addressed: expected 2 (per-model difference, per-model zero baseline for a new model, dropped fields, 9 decimal places, order of `model_usage`): scenarios 1, 2 and 4. The model order and 9-decimal rounding follow the code of `addModelUsage` and `session.usageOf`.
- Addressed: expected 3 (baseline advances only on a successful round): scenario 3, mirroring how `session.mapUsage` advances the cost baseline only on a usable result.
- Addressed: expected 4 (everything else unchanged): the existing model-usage, cost-baseline and k-exec-result-model-usage tests, kept unchanged.
- Addressed: the 20-model cap and `model_usage_omitted` stay; unchanged code path for ids beyond 20 (no entry, no baseline).
- Observed (AoR h20, rails-ft-saas-billing): round 1 `usage.input` is 7335623 with `usage.cached` 7169595 while `model_usage.input` for the same round is 108 and `cached` 7169595. The scenarios use the request's synthetic figures instead of that log.
- Observed (AoR h22, rails-ft-data-export-and-import): round 2 has `usage.cost_usd` 0.1793806 and `model_usage` cost 10.1649818, the cumulative figure.
- Omitted: the new Go test names TestModelRoundUsageSecondRoundIsTheDifference, TestModelRoundUsagePerModelBaseline, TestModelRoundUsageFailedRoundKeepsBaseline, TestModelRoundUsageCounterReset and TestModelRoundUsageAbsentBreakdown are for the Build to write; acceptance does not run them by name.

## Tests
- A second round reports its own per-model figures and the scope (m: input 100, cached 1000, output 50, cost 4 then 130, 1500, 60, 4.25 gives cached 500, cost_usd 0.25, input 30, output 10): TestModelRoundUsageSecondRoundIsTheDifference (unit)
- The first round equals its totals; a model new in a later round starts at zero and each model has its own baseline: TestModelRoundUsagePerModelBaseline (unit)
- A failed round after a result does not move the baseline: TestModelRoundUsageFailedRoundKeepsBaseline (unit)
- A counter that went down is left out and the lower value becomes the baseline: TestModelRoundUsageCounterReset (unit)
- A result without modelUsage gives an event with neither new key, and a later round is measured against zero: TestModelRoundUsageAbsentBreakdown (unit)
- model_usage, usage, the cost baseline and the model cap are unchanged: the existing model_usage_test.go, cost_baseline_test.go and failed_round_usage_test.go tests (existing)

## Feasibility
- none. The acceptance driver and the correct and wrong implementations of controls.json were exercised in a scratch copy: the correct implementation passes all five driver scenarios and each wrong implementation fails exactly the driver scenario it targets.
