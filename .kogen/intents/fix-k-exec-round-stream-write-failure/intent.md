# Keep a round's own failure over persistence errors

Slug: fix-k-exec-round-stream-write-failure
Model: not applicable — one precedence rule between two errors of a single round; no states or interacting rules
Acceptance:
- .kogen/intents/fix-k-exec-round-stream-write-failure/acceptance.feature
- features/steps/fix-k-exec-round-stream-write-failure__steps.js

This fixes an automated review finding on the landed k-exec-round-stream-write-failure change. The finding: "A persistence error overwrites an existing round failure (timeout, usage limit, schema) with `executor/failed`, so the real reason is lost." It points at the deferred persistence-error block of `runRound` in `executor/claudecode/session.go` (lines 258-269 on main): when a retained artifact (`round-N.jsonl` or `round-N.stderr`) failed to persist, that block replaces whatever `runRound` returns with `executor.Fail(executor.ReasonFailed, "cannot persist <artifact> after <N> bytes")`.

**It reproduces on current main (cf4a340).** A scratch probe ran one round through the real adapter with the fake `claude`, a synthetic token (so the redactor holds the child's single stderr byte `x` back until the final flush), and `round-1.stderr` symlinked to `/dev/full`. Every one of these rounds returned `executor/failed: cannot persist round-1.stderr after 0 bytes`, and its `executor_round_failed` event had `reason: "failed"`:
- a context deadline (expected `executor/deadline`) and a cancellation (expected `executor/interrupted`): the deferred block overwrites the error returned on `ctx.Done()`;
- an init event with `permissionMode: "default"` (expected `executor/protocol`): the deferred block overwrites the error returned by the stream gate;
- a usage-limit result (expected `executor/usage_limit`) and a review round whose success result has no `structured_output` (expected `executor/protocol`, the schema case): here the reason is lost one step earlier, because `runRound` checks `streamFile.err`/`stderrFile.err` after `finalize()` (session.go:458-461) and returns "artifact write failed" before `rr.finish` ever classifies the result; the deferred block then names the artifact.

**New precedence rule.** A retained-artifact persistence failure decides the round's error only when the round would otherwise have succeeded, or when the round's only failure is the adapter's own detection of that failed artifact write (today's generic "artifact write failed" returns at session.go:373, 404 and 460). In those cases the result stays exactly as today: no result, `executor/failed`, detail `cannot persist <artifact> after <N> bytes`. When the round has failed for any other reason, that failure is returned unchanged (same class, reason and detail), whether it arose before the persistence failure was detected (deadline, interruption, stream/protocol/auth gate errors, prompt-send or read errors) or from classifying the Claude Code result (usage limit, missing or invalid `structured_output`, exit-status and other result failures). For the result-classified failures this means `rr.finish` must classify the result even when `finalize()` found a persistence failure; a successful classification is then replaced by the persistence failure as today. The existing check that turns a usage limit with a still-live process group into "Claude Code process group did not exit; continuation is unsafe" stays.

In every case where a retained artifact failed, the terminal `executor_round_failed` event still carries `artifact` and `kept_bytes` for that artifact (and the unchanged `stderr_persist_*`/`stream_persist_*` fields); only its `reason` and `detail` follow the rule above. No `executor_round_ended` event is emitted for these rounds. The session still refuses further rounds after the failure.

**Unchanged.** Artifact writing, caps, markers, redaction, `finalize()` itself (stderr drainage and process-group cleanup before return), the event field set, and every existing error text. No unrelated changes.

**Documentation.** Update the last paragraph of "Claude Code round artifact persistence" in `docs/executor-contract.md`: a failed or short write fails a round that would otherwise succeed with `executor/failed`; when the round already fails for another reason (for example a deadline, an interruption, a protocol error, a usage limit or a missing structured submission), that failure's reason and detail are kept, and the `executor_round_failed` event still has `artifact` and `kept_bytes`.

**Tests.** First add the regression tests below to `executor/claudecode/persistence_test.go`; they must fail on unchanged main. Then fix `runRound`. Keep every existing test green.

## Decisions
- Reproduce first; the scenario holds on main for deadline, interruption, a stream gate protocol error, usage limit and a missing review `structured_output`, so the fix proceeds (source: request)
- Of the two suggested fixes, apply the broader one: the persistence failure overrides only success (or the adapter's own generic artifact-write failure, which is the same failure), so cancellation, deadline and usage-limit errors win, and so do protocol and schema errors (source: request)
- Only the lost reason is restored: the failure event keeps reporting the failed artifact and its kept bytes, as the landed change does, alongside the preserved reason and detail (source: request)

## Source comparison
- Addressed: "First reproduce it": reproduced by scratch probe on cf4a340 (results above); the acceptance scenarios for deadline, interrupted, protocol, usage limit and schema fail on main with `executor/failed` / `cannot persist round-1.stderr after 0 bytes`, and the Build adds Go regression tests that fail on main.
- Addressed: "Override only when `roundErr==nil`, or let cancellation and usage-limit errors win": the rule above does both. Literal `roundErr==nil` alone would turn the existing named `cannot persist …` detail back into "artifact write failed" for persistence-only failures (breaking TestFinalPersistenceFailures and TestStderrWriteFailureCountsEveryByte), and would not fix usage limit or schema, which are lost at session.go:458-461 before the deferred block; the rule covers both.
- Addressed: "Where: session.go deferred persistence-error block": the change is there plus the result-classification order at session.go:458-462, the only other place the same overwrite happens.
- Addressed: "Keep every existing test green; no unrelated changes": the success-plus-persistence-failure acceptance scenario and the existing persistence tests pin the unchanged behavior.

## Tests
- A deadline or cancellation survives a later persistence failure: regression test in executor/claudecode/persistence_test.go with a token-buffered stderr byte, `round-1.stderr` on `/dev/full`, a child that sleeps, and a context deadline / cancellation; asserts `executor/deadline` / `executor/interrupted` with their unchanged details and an event with that reason plus `artifact: "round-1.stderr"`, `kept_bytes: 0` (regression)
- A stream gate protocol error survives a later persistence failure: same test, init event with `permissionMode: "default"`, expecting `executor/protocol` `Claude Code reports permission mode "default", not acceptEdits` (regression)
- A usage-limit or missing-structured-output result survives a persistence failure: same test with a usage-limit result and with a review round whose result has no `structured_output` (regression)
- A round that would succeed still fails with `executor/failed` `cannot persist <artifact> after <N> bytes`: existing TestFinalPersistenceFailures, TestStderrWriteFailureCountsEveryByte and the acceptance success scenario (existing)
- End-to-end precedence through the real adapter for all six cases: acceptance.feature via features/steps/fix-k-exec-round-stream-write-failure__steps.js (integration)

## Feasibility
- evidence: {"id":"round-failure-observer","kind":"observer","inputs":["features/steps/fix-k-exec-round-stream-write-failure__steps.js"],"observers":["features/steps/fix-k-exec-round-stream-write-failure__steps.js"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/fix-k-exec-round-stream-write-failure__steps.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/fix-k-exec-round-stream-write-failure__steps.js bad","exit":1,"output":"rejected\n"}]}
