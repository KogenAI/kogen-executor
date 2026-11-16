# Name the signal that ended Claude Code in a

Slug: exec-round-process-signal-end-named
Model: not applicable — a stateless change to the wording of one failure detail built from the process's end
Acceptance:
- .kogen/intents/exec-round-process-signal-end-named/acceptance.feature
- features/steps/exec-round-process-signal-end-named__steps.js
- features/steps/exec-round-process-signal-end-named__driver/driver_test.go.txt

When Claude Code is ended by a signal during a round, the executor fails the round with `Claude Code exited with status -1`, a number Go only uses as a placeholder for a process that did not exit normally. This change makes the three round failures that come from the end of the process (in `finish` in `executor/claudecode/stream.go`) say how it ended, in the same words at all three places.

For a process that exited with a status, the three messages keep their exact wording. For a process ended by a signal, the words `exited with status N` become `was ended by signal N (name)`, N being the signal number and name the text `syscall.Signal` gives for it (`killed` for 9, `terminated` for 15). What follows (` before starting`, ` without a result`, ` after a success result`, and the stderr tail) is unchanged. So: `Claude Code was ended by signal 15 (terminated) before starting` plus the stderr tail; `Claude Code was ended by signal 9 (killed) without a result`; `Claude Code was ended by signal 9 (killed) after a success result`. Reason and class stay `executor/failed`.

Boundaries: no new configuration; no change to Kogen's exit codes, to which rounds fail, to the cases where `killed` is true (the adapter ended the process: no failure from the exit), to the protocol failures for a stream without init or result and a clean exit, to `stderrTail`, or to events other than the `detail` text of `executor_round_failed`. `finish`'s parameter list does not change (`unanswered_test.go` calls it as `r.finish(0, false, "")`). No docs or contract change.

## Decisions
- The signal reaches `finish` through a new field of `roundRun` (a `syscall.Signal`, 0 when the process exited with a status), set in `session.go` from the wait error's `syscall.WaitStatus` when it is signaled; `finish` gets no new parameter. (constraint: finish's parameter list is unchanged) (evidence: executor/claudecode/session.go; executor/claudecode/stream.go) (source: request)
- One method of `roundRun` words the process's end (`exited with status N` or `was ended by signal N (name)`) and all three failure messages use it, so they cannot drift apart. The name is `syscall.Signal`'s own `String()`. No helper wording a signal ending was found in the package on main; if one exists when this is built, it is reused and a second is not written. (evidence: executor/claudecode/stream.go; executor/claudecode/session.go) (assumption: the user confirms no such helper is added by another change before this is built) (source: request)
- A wait error that is not an `exec.ExitError` keeps `exit = -1` and the `exited with status -1` wording, since no signal is known. (evidence: executor/claudecode/session.go) (assumption: the user confirms a wait error that is not an ExitError keeps the status wording) (source: request)
- The fake Claude of `fake_test.go` gains `Signal int` (json `signal`) and `SignalAt string` (json `signal_at`) in `fakeConfig`. With `Signal` not 0 it ends itself with `syscall.Kill(os.Getpid(), syscall.Signal(cfg.Signal))` and then blocks, at `before_stdin` (in place of the ExitBeforeStdin return, after its stderr line), `after_init` (in place of the NoResult return, after the init line) or `after_result` (in place of the final `return exit`, after the result line). (evidence: executor/claudecode/fake_test.go; executor/claudecode/adapter_test.go) (source: request)
- The Build adds `executor/claudecode/round_signal_end_test.go` with three focused, model-free tests using newHarness, h.startOK, oneRound, finishRound and wantError. The acceptance scenarios drive the same cases through their own driver (copied into the package by a go overlay), because those named tests do not exist before the Build. (evidence: executor/claudecode/adapter_test.go; features/steps/exec-round-model-usage-states-its-scope__steps.js) (source: request)
- The signal reaches finish through a new roundRun field (syscall.Signal, 0 when the process exited with a status), set in session.go from the wait error's syscall.WaitStatus when signaled; finish gets no new parameter. (decision: D1, round 1) (constraint: finish's parameter list is unchanged) (evidence: executor/claudecode/session.go; executor/claudecode/stream.go) (source: request)
- One roundRun method words the process end (exited with status N / was ended by signal N (name)) and all three failure messages use it; name is syscall.Signal.String(). (decision: D2, round 1) (evidence: executor/claudecode/stream.go; executor/claudecode/session.go) (assumption: No pre-existing signal-wording helper was found in the package on main; the user confirms none is added by another change before the build.) (source: request)
- A wait error that is not an ExitError keeps exit -1 and the status wording, since no signal is known. (decision: D3, round 1) (evidence: executor/claudecode/session.go) (assumption: The user confirms this fallback wording.) (source: request)
- fakeConfig gains Signal and SignalAt; the fake kills itself with syscall.Kill at before_stdin, after_init or after_result then blocks. (decision: D4, round 1) (evidence: executor/claudecode/fake_test.go; executor/claudecode/adapter_test.go) (source: request)
- The Build adds round_signal_end_test.go with three unit tests; acceptance drives the same cases through its own go-overlay driver because the named tests do not exist before the Build. (decision: D5, round 1) (evidence: executor/claudecode/adapter_test.go; features/steps/exec-round-model-usage-states-its-scope__steps.js) (source: request)

## Source comparison
- Current behavior, from the request's reading of the source: in `executor/claudecode/session.go` (lines 471-481) `exit := 0` is set, then `errors.As(waitErr, &ee)` sets `exit = ee.ExitCode()` for a `*exec.ExitError`, any other `waitErr` sets `exit = -1`, and `rr.finish(exit, killed, errPath)` is called; `os/exec` documents that `ExitCode` returns -1 for a process ended by a signal, so the signal that the `*exec.ExitError` carries is dropped. Superseded for the signal case by this Intent.
- Current behavior: `finish` in `executor/claudecode/stream.go` builds `"Claude Code exited with status "+strconv.Itoa(exit)+" before starting"+stderrTail(stderrPath, s.a.redact)` and the same text with ` without a result` and ` after a success result`; for a signal ended process today they read `exited with status -1 before starting`, `exited with status -1 without a result` and `exited with status -1 after a success result`. Superseded for a signal ended process; unchanged for a process that exited with a status.
- Addressed: expected wording for a signal ended process in all three messages: scenarios 1 to 3 and the three Go tests.
- Addressed: wording for a status exit unchanged: existing TestEarlyExitBeforeReadingStdin (`status 3`) and TestResultFailures (`status 3`) keep passing unchanged.
- Addressed: unchanged `finish` signature, reason and class `executor/failed`: scenarios check the class and reason, and unanswered_test.go compiles unchanged.
- Addressed: wrong implementation per message: controls.json has one wrong implementation per message that leaves `exited with status` there.

## Tests
- A signal before the init event is named with the stderr tail kept: TestRoundSignalBeforeInitIsNamed (unit)
- A signal after init and before a result is named: TestRoundSignalWithoutResultIsNamed (unit)
- A signal after a success result is named: TestRoundSignalAfterSuccessResultIsNamed (unit)
- A status exit keeps its wording: TestEarlyExitBeforeReadingStdin and TestResultFailures (existing)

## Feasibility
- none
