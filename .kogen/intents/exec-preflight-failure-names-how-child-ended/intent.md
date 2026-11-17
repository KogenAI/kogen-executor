# Name how a failed Claude Code check ended

Slug: exec-preflight-failure-names-how-child-ended
Model: not applicable — a stateless change to the wording of two failure details built from how a child process ended
Acceptance:
- .kogen/intents/exec-preflight-failure-names-how-child-ended/acceptance.feature
- features/steps/exec-preflight-failure-names-how-child-ended__steps.js
- features/steps/exec-preflight-failure-names-how-child-ended__driver/driver_test.go.txt

When one of Kogen's no-model-call checks of its own Claude Code fails (`claude --version`, which also verifies a freshly downloaded runtime, and `claude auth status --json`), the refusal does not say how the process ended. `run` ends its detail after `failed: ` when stderr is empty, and `authStatus` always gives the same fixed advice. This change makes both say how the child ended, in one form.

A failure of the process (not the caller's context ending, which stays as it is) is worded by how it ended:
- exited with a status: `exited with status N`;
- ended by a signal: `was ended by signal N (name)`, name being the text `syscall.Signal` gives (`killed` for 9, `terminated` for 15);
- could not be started: `could not start: ` followed by the start error's own text (for a missing file: `fork/exec`, a space, the path and `: no such file or directory`).

For `run` the detail is the command in backticks (`claude` and its arguments joined by spaces), then `failed: `, then that wording, then, only when the redacted, trimmed stderr is not empty, `; stderr: ` and the same bounded (300 bytes) stderr text as today. For `authStatus` the two fixed-advice details keep their text but `failed` is followed by the wording in parentheses: `` `claude auth status --json` failed (exited with status 2); make a token with `claude setup-token` and save it with `kogen provider login claude-code` ``. The stderr is never added to the auth status detail. The reason stays `executor/unavailable`. A downloaded-runtime refusal and a version refusal get the new wording through `run` with no change of their own.

Unchanged: no new configuration; token redaction; the 300-byte bound; the context-ended failures (`classify(ctx)`); the unreadable-answer detail of authStatus; the auth refusals (`executor/auth_refused`); the install pin, size and download texts.

## Decisions
- The wording of a process end is produced by one package function `processEnd(sig syscall.Signal, exit int)` extracted from the existing `roundRun.processEnd` in stream.go (which now calls it), so the round failures and the preflight failures share one helper and no second one is written. (decision: D1, round 1) (evidence: executor/claudecode/stream.go; executor/claudecode/session.go) (source: request)
- `run` is split: a lower-level function runs the child and returns the output, the wording of how it ended (empty on success), the redacted bounded stderr text and the caller's context error; `run` builds the `failed: ` detail from them and `authStatus` builds its fixed-advice detail from the wording alone, so the stderr cannot reach it. (decision: D2, round 1) (evidence: executor/claudecode/claudecode.go; executor/claudecode/adapter_test.go) (source: request)
- An error of `startWithToken`/`Start` is worded `could not start: ` plus its text; a Wait error that is an `exec.ExitError` is worded by its signal or exit code; a Wait error of another kind (for example an output pipe held open) is worded `failed while waiting: ` plus its text, since the request names no wording for it. (decision: D3, round 1) (evidence: executor/claudecode/claudecode.go) (assumption: the user confirms the wording for a Wait error that is not an ExitError) (source: request)
- The Build adds executor/claudecode/preflight_failure_test.go with TestRunFailureNamesExitStatus, TestRunFailureKeepsStderrAfterTheStatus, TestRunFailureNamesTheSignal, TestRunFailureNamesAStartError and TestAuthStatusFailureNamesHowTheChildEnded, in the style of TestRunRedactsBeforeBounding: `a := New(Options{Home: t.TempDir()}).(*adapter)`, a `#!/bin/sh` script in `t.TempDir()` with mode 0700, `wantError` for the reason; each runs alone with `go test ./executor/claudecode -run` and its test name. The acceptance scenarios drive the same cases through their own driver copied into the package by a go overlay, because those named tests do not exist before the Build. (decision: D4, round 1) (evidence: executor/claudecode/adapter_test.go; features/steps/exec-round-process-signal-end-named__steps.js) (source: request)

## Source comparison
- Addressed: exit status without output (`exited with status 3`): scenario 1 and TestRunFailureNamesExitStatus.
- Addressed: exit status with stderr (`; stderr: boom`): scenario 2 and TestRunFailureKeepsStderrAfterTheStatus.
- Addressed: signal (`was ended by signal 9 (killed)`): scenario 3 and TestRunFailureNamesTheSignal.
- Addressed: cannot start: scenario 4 and TestRunFailureNamesAStartError.
- Addressed: stderr bound unchanged: scenario 5.
- Addressed: auth status exit 2 and signal 15, with the advice text: scenarios 6 and 7 and TestAuthStatusFailureNamesHowTheChildEnded; start error: scenario 8; stderr never shown: scenario 9; unreadable answer unchanged: scenario 10.
- Unchanged and not re-tested here: context-ended failures, auth refusals, install texts (existing tests).
- Request literals, quoted from the request: the direct callers are of `adapter.run`; today `run` returns executor.Fail(executor.ReasonUnavailable, "`claude "+strings.Join(args, " ")+"` failed: "+bound(a.redact(strings.TrimSpace(errBuf.String())), 300)) and `authStatus` returns the detail ending ` failed; make a token with ` followed by the kogenLogin text; the downloaded-runtime refusal is `"the downloaded Claude Code does not run: " + err.Error() + "; nothing was installed"`, which gets the new wording through `run`. Each control runs only its own test with `go test ./executor/claudecode -run` and the test name.
- Request wrong-implementation notes, quoted: test 2: ". Wrong implementation: keeps today's detail, which is " ` failed: boom ` with no status (the new detail is exactly `` `claude --version` failed: exited with status 3; stderr: boom ``); test 3: ". Wrong implementation: words a signal as " `exited with status -1`; test 4: the expected text is `could not start: fork/exec` " followed by a space, the full path, and " `: no such file or directory` " (build the expected text from the path in the test). Wrong implementation: words every failure that has no exit code as an exit status, " `exited with status 0`. These are covered as the wrong-implementation shapes the scenarios must reject.

## Tests
- A child that exits with a status and no output: `run` detail is exactly `` `claude --version` failed: exited with status 3 ``: TestRunFailureNamesExitStatus (unit)
- A child that exits with a status and stderr: the detail ends `; stderr: boom` after the status: TestRunFailureKeepsStderrAfterTheStatus (unit)
- A child ended by signal 9: the detail says `was ended by signal 9 (killed)`: TestRunFailureNamesTheSignal (unit)
- A path that cannot be started: the detail says `could not start: fork/exec <path>: no such file or directory`: TestRunFailureNamesAStartError (unit)
- authStatus with `exit 2` and with `kill -15 $$`: the fixed advice keeps its text with the wording in parentheses and no stderr: TestAuthStatusFailureNamesHowTheChildEnded (unit)
- The auth stderr is still never shown and the install texts are unchanged: the existing adapter tests, kept passing (existing)

## Feasibility
- none
