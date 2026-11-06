# Omit unobserved round model and test field order

Slug: fix-k-exec-requested-model-visible
Model: not applicable — a per-round flag set from one init field and a unit test's fixture values; no new state machine
Acceptance:
- .kogen/intents/fix-k-exec-requested-model-visible/acceptance.feature
- features/steps/fix-k-exec-requested-model-visible__steps.js

This fixes a review finding (P2) on the landed change k-exec-requested-model-visible, which adds `requested_model` and `model` to the Claude Code adapter's `executor_round_ended` and `executor_round_failed` events through `(*roundRun).addModels` in `executor/claudecode/stream.go`. The finding, about `TestRoundModelProjection` in `executor/claudecode/round_models_test.go`: "The task and observed model use the same string, so swapping the two fields in `addModels` still passes. `modelSeen` is set without a model, so the event carries `"model":""` instead of omitting it."

Both parts reproduce on current main (scratch copy, unchanged tree otherwise):
- With `addModels` changed to write `requested_model` from the observed model (`r.model`) and `model` from the task model (`r.s.task.Model`), `go test ./executor/claudecode -run '^TestRoundModelProjection$'` still reports `--- PASS: TestRoundModelProjection`, because every case sets `task.Model` and `roundRun.model` to the same input string.
- `(*roundRun).gate` sets `r.modelSeen = true` for every accepted init event, whatever its `"model"` value. A real round through the fake Claude Code requesting `alias-a` whose init has no `model` key, `"model":""` or `"model":7` ends `finish` with an `executor_round_ended` event carrying `"requested_model":"alias-a"` and `"model":""`.

The fix:
- `gate` sets `modelSeen` only when the init event's `"model"` is a non-empty JSON string. So `executor_round_ended` and `executor_round_failed` omit the `model` key when the init has no `model`, has an empty string or has a non-string value.
- `TestRoundModelProjection` uses distinct requested and observed values in its cases, with the expected value of each field derived from that field's own input. It must then fail when `addModels` swaps the two fields and pass on the fixed tree. Its other existing cases are kept (evidence: request "Keep every existing test green"; executor/claudecode/round_models_test.go:11-31 checks inputs of 255, 256 and 257 bytes, a rune at the cut and credential-bearing text).

Everything else stays as it is, because the request asks for "no unrelated changes": the non-empty observed `model` value and `requested_model` keep their current projection (evidence: request "no unrelated changes" and "Keep every existing test green"; executor/claudecode/stream.go:758-764; executor/claudecode/round_models_test.go:33-45 TestRoundModelsAlias expects `requested_model` `alias-a` and `model` `full-id-a`). The same applies to the raw `--model` argument, usage accounting (`mapUsage`/`usageOf` still get the init's model string as today), `s.model`, endings, reasons, `executor_started` and every other event field.

## Decisions
- First show it, then fix it: both parts of the finding reproduce on current main (see above), so a code change is needed. (source: request)
- Use distinct requested and observed values in `TestRoundModelProjection`. (source: request)
- Set `modelSeen` only for a non-empty string. A missing key, `""` and a non-string value such as `7` all count as "no model", and the event omits `model`. (source: request)
- Keep every existing test green, with no unrelated changes. (source: request)

## Source comparison
- Addressed: "swapping the two fields in `addModels` still passes". Acceptance scenario "TestRoundModelProjection catches swapped model fields" runs the real `TestRoundModelProjection` with `addModels` replaced (via `go test -overlay`) by the swapped version. It requires `--- FAIL: TestRoundModelProjection`, and requires `--- PASS: TestRoundModelProjection` on the tree as built. On current main the swapped run passes, so the scenario is red.
- Addressed: "`modelSeen` is set without a model, so the event carries `\"model\":\"\"`". The acceptance outline runs real ok and error rounds requesting `alias-a` with init model JSON `null` (key removed), `""` and `7`, and requires the terminal event to omit `model` while keeping `requested_model` `alias-a`.
- Addressed: "Keep every existing test green; no unrelated changes". Each acceptance row first runs the same mode with init model `"full-id-a"` and requires `model` `full-id-a`. This keeps existing behaviour and rejects a fix that drops `model` entirely (evidence: request "no unrelated changes"; executor/claudecode/round_models_test.go:33-45 TestRoundModelsAlias expects `model` `full-id-a`). The configured checks (`go build`, `go vet`, `go test`) cover the rest.
- Addressed: "First show it … If that does not hold, stop and report that it does not reproduce". It holds (reproduction above), so this is a fix, not a not-reproduced report.
- Omitted: nothing from the request.

## Tests
- TestRoundModelProjection fails when `addModels` swaps `requested_model` and `model`: update `TestRoundModelProjection` in `executor/claudecode/round_models_test.go` so each case gives `task.Model` and `roundRun.model` different inputs and checks each field against its own expected value; acceptance mutation scenario (regression)
- An init event without a non-empty string `model` leaves `model` out of the terminal event: new Go test in `executor/claudecode/round_models_test.go` through `newHarness` with `fakeConfig{Init: map[string]any{"model": nil}}` and `{"model": ""}` asserting `executor_round_ended` has no `model` key; acceptance outline rows for ok and error rounds with `null`, `""` and `7` (regression)
- Existing tests stay green with no unrelated changes (evidence: request "Keep every existing test green"; TestRoundModelsAlias and the first half of each acceptance row): existing tests and the landed k-exec-requested-model-visible acceptance (existing)

## Feasibility
- Reproduced on current main in a scratch copy. A capture test through `newHarness` with init model `nil`, `""` and `7` produced `executor_round_ended` with `"model":""` and `"requested_model":"alias-a"`. With `addModels` swapped, `TestRoundModelProjection` passed and only `TestRoundModelsAlias` failed.
- evidence: {"id":"model-seen-observer","kind":"observer","inputs":["features/steps/fix-k-exec-requested-model-visible__steps.js"],"observers":["features/steps/fix-k-exec-requested-model-visible__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-k-exec-requested-model-visible__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-k-exec-requested-model-visible__steps.js bad","exit":1,"output":"observer bad rejected\n"}]}
