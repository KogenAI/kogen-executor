# Record round interruption causes

Slug: k-exec-interrupt-cause
Model: not applicable — this adds a stateless observation of the existing context/cause and a start-time deadline snapshot; it does not change the round lifecycle or stopping transitions
Acceptance:
- .kogen/intents/k-exec-interrupt-cause/acceptance.feature
- features/steps/interrupt_cause.js
- features/steps/interrupt_capture_test.go.txt

Add diagnostic metadata to Claude Code round-ending events without changing how anything is stopped or which errors and exit codes callers receive. The current context-only diagnostic conflates caller cancellation and signal cancellation; preserve existing reason/detail compatibility while adding an independent cause class. Implementation may touch executor/executor.go, executor/claudecode/claudecode.go, session.go and stream.go and focused tests/contract cases as needed. Do not edit prompts or runtime.go. No coordinator or consumer repository changes are included.

## Decisions
- On executor_round_failed caused by a done round context, add interrupt_cause with exactly deadline, signal, or cancelled. Deadline means the effective context reports context.DeadlineExceeded; signal means its cause is the existing sys.Interrupted (including a wrapped instance); otherwise cancellation means cancelled. For signal include signal as its numeric POSIX signal number (SIGTERM 15, SIGINT 2, SIGHUP 1). Do not infer signals from subprocess exit codes. Non-interrupted failures and successes have no interrupt_cause or signal metadata. (source: request)
- Add deadline_remaining_ms to every emitted round-ending event (executor_round_failed and executor_round_ended): explicit null when no deadline applies; otherwise a nonnegative integer number of milliseconds remaining at round start, truncated to milliseconds and clamped to zero for an expired deadline. Use the earlier of the caller context deadline and Task.Deadline, after composing them as today. Capture once before emitting executor_round_started, and retain that value through the round. This is not the budget left at round end. (source: request)
- Preserve returned signal error identity and exit code, including SIGINT 130, SIGTERM 143 and SIGHUP 129; retain current context-deadline and ordinary-cancel errors/reasons. Correct the misleading SIGINT-exits-0 comment if touched. No stop timing, process termination, prompt, runtime, or exit-code behavior changes. (source: request)
- Deadline tests must bracket the actual start snapshot, not assert that a 4-second budget still has 2000–4000 ms at round end. Acceptance delays in the start callback until the remaining budget is below the start bracket, then cancels, so an end-time snapshot is rejected without constraining round duration. Test both task-earlier and caller-earlier deadlines under -race. (source: request)

## Source comparison
- Addressed: Need's three cause classes and numeric signal, and start-time remaining deadline, by Decisions 1–2 and the complete acceptance table; existing context-only reason fields are preserved, not used as the new cause channel.
- Addressed: Independence excludes prompt files and runtime.go; this contract explicitly preserves that boundary. session.go and stream.go currently emit terminal events and therefore are necessary wiring locations, not a change to stopping behavior.
- Addressed: earlier Build 6fde73c8 contradiction is superseded by the explicit unchanged SIGINT 130 contract, exercised alongside SIGTERM 143 and original signal-error identity. No SIGINT exit-0 assertion remains.
- Addressed: landing race failure interrupt_cause_test.go:49 task_earlier with observed deadline 1931 is the counterexample to elapsed-wall-time assumptions; start-bracket acceptance and required focused regression tests replace the brittle 2000–4000-at-end condition.
- Addressed as historical evidence, not a new runtime dependency: 26 scanned rounds, 25 completed and aorclaude5-eu2 saas-billing r1/g0 round-1 at 20:19:34Z after 575 seconds of Build, exit 143, timeout after a 3600-second shaping-consumed deadline; coordinator's six SIGTERM stops and X-E1 motivate the local deadline/SIGTERM/caller-cancel distinguishing cases. No paid cells or reproduction of a 3600-second wait is required.
- Omitted intentionally: no re-run or recovery of the stopped or failed earlier Builds; this is a fresh Intent. Unrelated historical controls in the supplied testing policy do not authorize provider probing or unrelated project edits.

## Tests
- Distinguish expired deadline, signal cancellation and caller cancellation in the actual Round terminal record: acceptance capture through Round with real contexts and sys.Interrupted causes, using the existing local fake runtime (integration)
- Preserve original signal errors and existing SIGINT 130/SIGTERM 143 codes: acceptance identity/code checks and focused wrapped-cause/SIGHUP tests to add (regression)
- Record the earlier task/caller deadline once at round start, never at round end: start-bracket acceptance with delayed cancellation for both deadline orderings under -race; add focused TestRoundDeadlineSnapshot regressions without elapsed-round-duration bounds (regression)
- Represent absent and expired deadlines explicitly and keep success free of interruption metadata: null/zero and successful fake-runtime round acceptance cases (integration)
- Preserve stopping semantics and existing reason/detail behavior: existing adapter process cancellation tests and full configured build, vet, race suite unchanged (existing)

## Feasibility
- Local pinned sys source inspected in a probe: Interrupted stores Signal as a string; ExitCode maps SIGINT/SIGTERM/SIGHUP to 130/143/129. Source lookup exited 0; no external protocol or provider request changes.
- evidence: {"id":"interrupt-observer","kind":"observer","inputs":["features/steps/interrupt_capture_test.go.txt","features/steps/interrupt_cause.js"],"observers":["features/steps/interrupt_capture_test.go.txt","features/steps/interrupt_cause.js"],"checks":[{"name":"good","command":"node features/steps/interrupt_cause.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"node features/steps/interrupt_cause.js bad","exit":1,"output":"observer rejected mutations\n"}]}
