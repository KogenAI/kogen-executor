# Test executor usage aggregation

Slug: core-executor-usage-aggregation-tests
Model: not applicable — ExecutorUsage.Plus is a pure value aggregation with no meaningful state
Acceptance:
- .kogen/intents/core-executor-usage-aggregation-tests/acceptance.feature
- features/steps/core-executor-usage-aggregation-tests__steps.js

Add focused regression tests in core/state_test.go for core.ExecutorUsage.Plus, which adds one executor round's reported usage to the running totals, so that changes to its persisted totals and state rules are caught directly. Only core/state_test.go is added: the aggregation behavior (core/state.go) and the persisted field formats stay exactly as they are.

The tests assert three behaviors. (1) Adding a round with complete counts, cost, source and state gives the component-wise totals and carries the round's source. (2) When either the total or the round omits a token count or the cost, that aggregate value is unknown (nil) while independently known fields still add. (3) The first round uses its own state, equal later states retain that state, differing states become partial, and an empty round state is unknown.

## Decisions
- The tests are added in core/state_test.go and call ExecutorUsage.Plus directly to assert the result of each behavior. (constraint: core/state.go stays identical to HEAD) (decision: D1, round 1) (evidence: core/state.go) (source: request)
- Acceptance is by mutation of a scratch copy of core/state.go: each wrong change (totals replaced, older source retained, missing count or cost as zero, known totals discarded when a count is unknown, first round partial, conflicting later state accepted, empty round state left empty) must make `go test ./core` fail with a failing test, after the same command passed on the unchanged tree. Acceptance does not name any test the Build adds. (decision: D2, round 1) (evidence: core/state.go) (source: request)
- No production change and no change to persisted field formats or aggregation behavior. (decision: D3, round 1) (constraint: core/state.go remains identical to HEAD) (evidence: core/state.go) (source: request)

## Source comparison
- Addressed: request acceptance 1 (complete round gives component-wise totals and carries the round's source) maps to the "replaces the totals" and "retains the older source" scenarios.
- Addressed: request acceptance 2 (missing count or cost makes the aggregate unknown while known fields still add) maps to the "missing count as zero" and "discards known totals" scenarios.
- Addressed: request acceptance 3 (first round state, equal states retained, differing states partial, empty round state unknown) maps to the "first round partial", "conflicting later state" and "empty round state" scenarios.
- Addressed: scope core/state_test.go only; out of scope changes to aggregation or field formats via the unchanged core/state.go check in every scenario.

## Tests
- Complete round adds component-wise and carries the round's source: add tests calling ExecutorUsage.Plus and comparing each total and the source (unit)
- Missing count or cost in the total or the round is unknown while known fields add: add a test with partially known totals and rounds asserting each field (unit)
- First round uses its own state, equal states retained, differing states partial, empty round state unknown: add tests asserting State for each rule (unit)

## Feasibility
- none
