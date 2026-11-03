# Deny wakeups in Shape and Review rounds

Slug: k-exec-nonbuild-wakeup-denied
Model: not applicable — this wires the existing Build tool denial into the other roles; session state and round transitions do not change
Acceptance:
- .kogen/intents/k-exec-nonbuild-wakeup-denied/acceptance.feature
- features/steps/k-exec-nonbuild-wakeup-denied__steps.js
- features/steps/k-exec-nonbuild-wakeup-denied__framing.js

Make every Claude Code role refuse ScheduleWakeup on every invocation, including initial and resumed rounds. A scheduled wakeup continues work after the round result and violates the adapter's strict stream protocol. Shape currently denies only file-writing tools; Review currently adds no denial. Extend those roles without changing Build, the protocol, session lifecycle, or any other tool permission. Commands must be awaited inside the current round rather than scheduling later continuation. No live model calls are needed.

## Decisions
- Every role's every round passes --disallowedTools naming ScheduleWakeup. Shape retains Edit, Write, MultiEdit and NotebookEdit, in that order, with ScheduleWakeup appended; Review denies only ScheduleWakeup. No other tool is gained or lost. Preserve all other argv bytes and ordering; Build's complete argv remains byte-identical. (source: request)
- ShapeConstraints and ReviewConstraints each include the exact sentence `Scheduled wakeups are unavailable; await commands and their completion within the current round.` Use the existing framing routes, including first-round stdin preface and --append-system-prompt. Build Constraints stays byte-identical. (source: request)
- Use the existing fake Claude Code WakeupAttempt fixture, which tries the tool before its result and honors disallowedTools. Shape and Review must reject it, end normally, and emit no events after the sole result. Preserve strict rejection of unrelated trailing events. (source: request)
- Update any argv/framing golden or contract expectations for Shape and Review only. Do not regenerate unrelated shared prompts or change Build's pinned expectations. (source: request)

## Source comparison
- Addressed: request Problem and Need, including first and resumed rounds, are implemented by extending executor/claudecode/args.go roleRoundArgs and the two nonbuild constraints; existing Build path and framing are preserved. The complete round contract is exercised in acceptance.feature scenario 1 for shape, build and review, rounds 1 and 2.
- Addressed: synthetic acceptance's wakeup-before-result reproduction uses the repository's real session entry point, roleHarness, and fakeConfig.WakeupAttempt in the protected step driver. It checks denial, attempted tool use, an error tool result saying unavailable, EndFinish, exactly one terminal result and no trailing event. Both nonbuild roles are exercised on both rounds rather than only inspecting argv.
- Addressed: synthetic acceptance's Shape file-writing denials and Build byte preservation are explicit Decisions above. The driver compares full fixed-input argv (Build including its original flag position), exactly ordered denied-tool lists, and all other argument bytes. Scenario 2 reads the exported Build Constraints value through a Go program and compares its complete original text.
- Addressed: request's golden/contract update requirement applies to the two changed roles only. Existing tests in executor/claudecode/wakeup_test.go currently pin Shape's old denial and must be updated, not weakened; lineup_test.go and contract/claudecode_rounds_test.go cover framing routes and should retain useful checks. Add focused nonbuild regression assertions there as needed. There is no authorization to change protected acceptance inputs.
- Omitted: no requested behavior or supplied non-secret literal. No other tools, roles, workflow, background-task policy, provider transport or public schema are changed. The README's normal Go checks and intentional-golden-update policy remain applicable.

## Tests
- Each role denies ScheduleWakeup on initial and resumed rounds, retaining exactly the other tool permissions and argv: extend TestBuildWakeupDeniedEveryRound or add a focused sibling table regression; acceptance compares fixed-input full argv and observes both actual session invocations (regression)
- Shape and Review wakeup attempts are rejected before the result with normal completion and no trailing events: use fakeConfig.WakeupAttempt through the existing session harness for both roles and rounds; retain TestBuildTrailingEventStillProtocol (integration)
- Shape and Review framing says wakeups are unavailable and commands are awaited inside the round: assert the exact sentence and verify first prompt and append-system-prompt delivery in the session harness (integration)
- Build framing and argv remain byte-identical: acceptance compares the exported Constraints text and complete fixed-input argv on rounds 1 and 2; retain useful existing Build coverage (regression)
- Golden and contract expectations reflect only intended nonbuild changes: update affected Shape/Review expectations and run ordinary go test ./... without -update, reviewing any deliberate golden diff (existing)

## Feasibility
- Existing local evidence: args.go already wires ScheduleWakeup denial for Build; fake_test.go implements the exact requested rejection/continuation fixture, and wakeup_test.go exercises it for Build. This is local reuse of established behavior, not a new external capability assumption. No external documentation lookup was needed.
- A scratch attempt to read retained proposals in a probe found they are not present in the probe copy (exit 2); it did not execute or qualify any observer. Native readiness will execute the final-byte controls below.
- evidence: {"id":"terminal-stream-observer","kind":"observer","inputs":["features/steps/k-exec-nonbuild-wakeup-denied__steps.js"],"observers":["features/steps/k-exec-nonbuild-wakeup-denied__steps.js"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/k-exec-nonbuild-wakeup-denied__steps.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/k-exec-nonbuild-wakeup-denied__steps.js bad","exit":1,"output":"observer rejected\n"}]}
