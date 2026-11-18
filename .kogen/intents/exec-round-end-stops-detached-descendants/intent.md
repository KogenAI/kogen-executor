# Stop detached descendants when a round ends

Slug: exec-round-end-stops-detached-descendants
Model: not applicable — a process-cleanup change with no meaningful state to model
Acceptance:
- .kogen/intents/exec-round-end-stops-detached-descendants/acceptance.feature
- features/steps/exec-round-end-stops-detached-descendants__steps.js
- features/steps/exec-round-end-stops-detached-descendants__driver/driver_test.go.txt
- features/steps/exec-round-end-stops-detached-descendants__driver/listing_test.go.txt

When the Claude Code executor ends a round or a preflight it signals only the child's process group. A descendant the model's shell tool started in its own session (setsid, a daemonizing tool) is outside that group, survives the end of the round, is reparented to PID 1 and keeps holding CPU, memory, ports and files. This change makes ending a round (and a preflight) also stop those detached descendants, and only the descendants of that round's Claude Code process.

Today `executor/claudecode/claudecode.go` starts the child with `Setpgid: true`, cancels with `syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)` and, after the leader is reaped, calls `killGroup(cmd.Process.Pid, exited)`; `killGroup`, `terminateGroup` and `groupAlive` in `executor/claudecode/session.go` address only `-pgid`.

Behavior: the executor records the live descendants of the child by following parent process ids from the child's pid, and keeps what it has recorded (pid and start time) for the life of the child. After the group kill and its bounded wait it sends SIGKILL to each recorded descendant that is still alive and still the same process (same pid and same start time, so a reused pid is never signalled), then waits a bounded time for them to be gone. Descendants already in the group behave as today.

Boundaries: the ordinary exit path, the exit status wording, retries and the result of a round do not change; no new configuration; no change to which rounds fail. If the process listing cannot be obtained the executor keeps today's group kill and does not fail the round for that reason. It works on Linux and macOS using only the standard library and `ps`, with no new dependency.

## Decisions
- The process listing is the text output of `ps -A -o pid=,ppid=,lstart=` obtained through a package-level variable `processTable` of type `func() (string, error)` in package `claudecode`; descendants are found by following ppid from the child's pid, and identity is pid plus the `lstart` start-time text. A listing error means no descendants are recorded and the group kill proceeds as today; the error is never returned as a round failure. (decision: D1, round 1) (constraint: processTable is replaceable by tests and standard library plus ps only) (evidence: executor/claudecode/session.go; executor/claudecode/claudecode.go) (assumption: the user confirms ps lstart text is an acceptable same-process check on Linux and macOS) (source: request)
- Descendants are recorded before the group is killed and stopped after the group kill, at the three places the request names (`runChild` after the leader is reaped, the `fail` closure/`killGroup`, and the post-wait kill) and also in `terminateGroup`, whose SIGTERM can end the whole group before `killGroup` runs (the cancellation path). A round that fails after the child already exited (a fake that starts a detached child and exits with status 3 before any result) leaves the detached process reparented to PID 1 before any kill site runs, so the recording is also refreshed on a fixed 500 ms interval while the child runs, as a union by pid and start time, and the kill sites merge a fresh listing into it. The interval is a constant, not a setting. (decision: D2, round 1) (constraint: no new configuration; the refresh stops when the child is reaped and its cleanup has run) (evidence: executor/claudecode/session.go; executor/claudecode/claudecode.go) (assumption: the user confirms a fixed 500 ms refresh of the descendant record is acceptable, since a ppid chain from an already exited child cannot otherwise be followed) (source: request)
- The fake Claude of `fake_test.go` gains `DetachedChild bool` (json `detached_child`) in `fakeConfig`: after its init event it starts `sleep 300` through os/exec with `SysProcAttr{Setsid: true}`, writes the pid to `.detached-child.pid` in its working directory (the round's checkout root), waits 1.5 s so the executor can see the child as a live descendant, and then continues its script. (decision: D3, round 1) (evidence: executor/claudecode/fake_test.go; executor/claudecode/adapter_test.go) (source: request)
- The Build adds `executor/claudecode/detached_descendant_test.go` with four focused model-free tests using newHarness, each runnable alone with `go test ./executor/claudecode -run` and its own name. The acceptance scenarios drive the same cases through their own drivers copied into the package by a go overlay, because those named tests do not exist before the Build; the step file patches the fake with DetachedChild through the overlay only when the tree's fake lacks it. (decision: D4, round 1) (evidence: executor/claudecode/adapter_test.go; executor/claudecode/fake_test.go) (source: request)
- A killed descendant that is a zombie awaiting its reaper counts as gone. (decision: D5, round 1) (assumption: the user confirms a zombie is not a live process for this purpose) (source: request)

## Source comparison
- Current behavior: `Setpgid: true` with `syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)` as cancel, and `killGroup(cmd.Process.Pid, exited)` after the leader is reaped; `killGroup`, `terminateGroup` and `groupAlive` address only `-pgid`, so a descendant in another session is never signalled. Superseded by this Intent.
- Addressed: cancelled round, failed round after the child exited with status 3 and no result, unrelated process untouched, listing failure keeps the group kill: scenarios 1 to 4 and the four Go tests.
- Addressed: no change to exit wording, retries, results or configuration: existing tests in the package keep passing unchanged.
- Addressed: the existing spawn_orphan action stays in the group and behaves as today.
- Addressed: each new test runs alone with `go test ./executor/claudecode -run` and its own name.

## Tests
- A cancelled round leaves no detached descendant: TestCancelledRoundStopsDetachedDescendant (unit)
- A round that fails after the child exited with status 3 leaves none: TestFailedRoundStopsDetachedDescendant (unit)
- A process that is not a descendant is never signalled: TestDescendantStopSkipsUnrelatedProcess (unit)
- An unavailable process listing neither fails a round nor stops the group kill: TestDescendantListingFailureKeepsGroupKill (unit)

## Feasibility
- none
