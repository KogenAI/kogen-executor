# Validate all unanswered calls before reporting

Slug: fix-k-exec-unanswered-guarded-call-at-result
Model: not applicable — a one-shot ordering and all-or-nothing reporting rule over the round's finite list of pending guarded calls at its accepted result; no new state or transitions
Acceptance:
- .kogen/intents/fix-k-exec-unanswered-guarded-call-at-result/acceptance.feature
- features/steps/fix-k-exec-unanswered-guarded-call-at-result__steps.js

Fix the review finding on the landed k-exec-unanswered-guarded-call-at-result change. `roundRun.checkUnanswered` in `executor/claudecode/stream.go` iterates the `r.pending` map, so the order of its checks and of its `executor_hook`/`executor_tool` events is random. When call A is accepted and call B then fails, A's `executor_hook` and `executor_tool` events (with `unanswered: true`) have already been emitted for a round that is rejected.

Reproduced on unchanged main (HEAD 1dde056) through the real adapter (`claudecode.New`, `Start`, `Round`) with a fake Claude Code runtime and the real PreToolUse hook. A: `Write` call `call-a` with an allow record and a changed target. B: `Write` call `call-b` with no hook record and a changed target. Both calls were still pending at a success result. In 23 of 24 rounds the adapter emitted `hook call-a allow, tool call-a unanswered` before failing with `executor/protocol: hook did not run for the Write call "call-b"`. With six allowed pending calls, the event order differed from the tool_use order in 12 of 24 rounds. With A allowed and B and C both lacking hook evidence, the error named `call-c` instead of `call-b` in 23 of 24 rounds.

Required behavior for `checkUnanswered`, which runs only for accepted endings (finish, no_call, blocker):
- Process the pending guarded calls in tool_use order: the order of their first `tool_use` in the stream (the existing `r.guardedOrder`), never map iteration order. Unguarded pending calls stay ignored, as now.
- First validate every pending guarded call with the existing rules: the missing-hook rule (no record and a changed or unobservable target gives `hookFailure`) and the denied-but-ran rule (deny record and a changed target). If any call fails, return the error for the first failing call in tool_use order. Do not emit any `executor_hook` or `executor_tool` event for any unanswered call of that round.
- Only when all pending guarded calls pass, emit their events in tool_use order. For each call, emit its `executor_hook` event first (only when a hook record exists, with unchanged fields), then its `executor_tool` event with unchanged fields (`round`, `name`, `tool_use_id`, `denied`, `arguments`, `unanswered: true`).

Unchanged: the existing diagnostics and their texts, the `hook_cause` and `hook_stderr` bookkeeping, the target observation and sentinel log rules, the answered-call handling in `toolResults`, error-result handling (including the usage-limit stop for unfinished calls) and every existing test. No retries, no new events, no settings and no unrelated changes.

## Decisions
- Process pending guarded calls in tool_use order. (source: request)
- Validate all pending guarded calls before emitting any event for them. A rejected round reports no unanswered-call events, and its error names the first failing call in tool_use order. (source: request)
- Keep every existing test green and make no unrelated changes. (source: request)

## Source comparison
- Addressed: the request's "first reproduce it" step was done during shaping through the real adapter on unchanged main: the scenario holds (see the prose above). The Build still adds the requested Go regression test, which must fail on the unfixed code, and the acceptance scenarios below are red on main.
- Addressed: "Sort by tool_use order" is the iteration order of validation and emission. The ordered-events scenario and the first-failure scenario check it.
- Addressed: "Validate all calls before emitting" means no hook or tool event for any unanswered call when any of them fails. The emit-then-fail scenario is the request's A-emitted, B-fails case.
- Addressed: "Keep every existing test green; no unrelated changes". The configured checks (gofmt, build, vet, go test) and the existing acceptance of k-exec-unanswered-guarded-call-at-result stay as they are.
- Location retained: `executor/claudecode/stream.go` `checkUnanswered`. Nothing is omitted or superseded.

## Tests
- A later failing unanswered guarded call stops the round before any event of an earlier accepted unanswered call is emitted: add a Go regression test in `executor/claudecode/unanswered_test.go`. It drives `roundRun` with call A (allow sentinel) before call B (no sentinel, target created after the tool_use line) and repeats enough rounds to fail reliably on the old map order. It asserts that the error names B and that no `executor_hook`/`executor_tool` events were emitted. Also add the acceptance scenario "A later failing call stops the round before an earlier allowed call is reported" (regression)
- The first failing call in tool_use order is the one reported: acceptance scenario "The first failing call in tool_use order is reported" (regression)
- Accepted unanswered guarded calls are reported in tool_use order: acceptance scenario "Accepted unanswered calls are reported in tool_use order", plus a repeated Go assertion of the ordered events in `executor/claudecode/unanswered_test.go` (regression)
- Existing unanswered and answered guarded-call behavior is preserved: the existing `TestAcceptedResultReportsOnlyPendingGuardedCalls`, `TestUnansweredHookEvents`, the claudecode hook tests and the k-exec-unanswered-guarded-call-at-result acceptance (existing)

## Feasibility
- Reproduced on unchanged main with the submitted driver through the real adapter and the real hook: emit-then-fail failed in 23 of 24 iterations, first-failure in 23 of 24 and ordered events in 12 of 24. Go's map iteration order is biased, so each scenario uses 24 iterations and fixtures where main rarely passes by chance. (scratch probe: about 18 s)
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/fix-k-exec-unanswered-guarded-call-at-result__steps.js"],"observers":["features/steps/fix-k-exec-unanswered-guarded-call-at-result__steps.js"],"checks":[{"name":"good","command":"node features/steps/fix-k-exec-unanswered-guarded-call-at-result__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"node features/steps/fix-k-exec-unanswered-guarded-call-at-result__steps.js bad","exit":1,"output":"observer rejected bad controls\n"}]}
