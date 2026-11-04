# Repair round cost baselines after gaps

Slug: k-exec-cost-baseline-gaps
Model: .kogen/intents/k-exec-cost-baseline-gaps/model.qnt invariants=Safe seed=17 samples=100 steps=20
Acceptance:
- .kogen/intents/k-exec-cost-baseline-gaps/acceptance.feature
- features/steps/k-exec-cost-baseline-gaps__steps.js

Correct Claude Code per-round cumulative-cost accounting in executor/claudecode. Replace retaining a stale usable baseline across successful rounds without usable totals or with decreased totals. Preserve token mapping, token-derived usage state, existing rounding and failed-event nonmutation. No provider requests or public API changes are needed.

## Decisions
- A new session starts with a usable zero baseline. After a mapped successful round without a usable total, the next usable total yields unknown cost and establishes a fresh baseline. A lower total likewise yields unknown cost and establishes its own baseline. Equal totals yield known zero. (source: request)
- Missing totals yield nil CostUSD, not zero. Repeated missing totals keep the gap open. Use existing numeric usability rules; do not broaden validation. (source: request)
- Failed round addResult may calculate event usage but must not advance or invalidate any cost-accounting state, including an outstanding gap. Token fields and complete/partial/unknown state remain independent of cost. (source: request)

## Source comparison
- Addressed: request Problem and Need stale spanning deltas and restarted counters are replaced by the baseline/gap transitions above and the acceptance sequences; existing stream.go mapUsage/usageOf currently advance only on nondecreasing totals.
- Addressed: synthetic examples 1–5 retain exact totals and costs in acceptance, including 0.40 re-anchoring observed through 0.55 and 0.20 re-anchoring through 0.35.
- Addressed: request token independence and failed-event nonadvancement are executable acceptance cases for complete, partial and unknown token state, including a failure during an open gap.
- Omitted: no requested behavior. No unrelated README configuration, transport or historical work is changed.

## Tests
- Missing totals invalidate the next delta and that usable total re-anchors: add focused sequence regression tests through session.mapUsage (regression)
- Lower totals re-anchor while equal totals yield known zero and normal totals retain deltas: add sequence tests through session.mapUsage (unit)
- Cost unknown does not change token fields or token-derived state: add complete, partial and absent token cases (unit)
- Failed-event usage leaves both valid baseline and gap unchanged: extend failed round usage tests through roundRun.addResult and subsequent mapUsage (regression)

## Feasibility
- Quint model typecheck succeeded in a scratch probe (exit 0); no external dependency changes or documentation needed for this local calculation.
- evidence: {"id":"comparison","kind":"observer","inputs":["features/steps/k-exec-cost-baseline-gaps__steps.js"],"observers":["features/steps/k-exec-cost-baseline-gaps__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-cost-baseline-gaps__steps.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-cost-baseline-gaps__steps.js bad","exit":1,"output":"rejected\n"}]}
