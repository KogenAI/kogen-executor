# Bound stalled runtime downloads

Slug: k-exec-install-download-stall
Model: .kogen/intents/k-exec-install-download-stall/model.qnt invariants=Cleanup,Notice seed=17 samples=100 steps=20
Acceptance:
- .kogen/intents/k-exec-install-download-stall/acceptance.feature
- features/steps/k-exec-install-download-stall__steps.js
- features/steps/k-exec-install-download-stall__driver.js

Replace the indefinite pinned runtime body read in executor/claudecode/runtime.go with a progress-based idle bound. A task with no deadline must not hold the exclusive installation lock forever after a connection accepts the request, sends part of the body and goes silent. A stalled install returns executor/unavailable, names its source and says the connection stalled, removes its .partial-* directory and releases install.lock before returning. A waiting process reports contention once on stderr, then can acquire the released lock and retry against its healthy origin. Preserve checksum, size, executable-version checks, atomic publication and existing context classification. No new user setting, pin, dependency or live external-service call.

## Decisions
- Reset the idle interval on every positive body read, never on empty reads; do not impose a total transfer deadline. Stop blocked network work at expiry and retire timers/watchers on all exits. (source: request)
- Declare `const downloadIdleTimeout = 30 * time.Second` on one line in runtime.go. Provide the internal adapter method `setDownloadIdleTimeoutForTest(time.Duration)` to override the duration for that adapter only; production uses the named constant. No environment variable, CLI flag or user configuration. Names and duration are technical settlements of the requested constant/test seam. Acceptance invokes this seam with 600 milliseconds in independently executed worker processes, without changing production source. (source: request)
- Emit exactly `kogen: another Claude Code installation is in progress; waiting\n` through the adapter's stderr writer once per contended attempt. Never emit on uncontended acquisition or repeat on polling/EINTR. Wording settles the requested waiting notice. (source: request)
- Caller cancellation/expiry when the download exits takes precedence: return classify(ctx)'s executor/interrupted or executor/deadline, never a stall message. (source: request)
- The idle interval covers waiting for the first response-body byte as well as gaps between body reads; it is neither a new global task deadline nor a lock-wait timeout. Do not use a caller deadline to simulate stall failure. (source: request)

## Source comparison
- Addressed: request Problem's no-deadline half-file stall and indefinite exclusive-lock hold are replaced by the resettable idle expiry, cleanup and lock release above. Acceptance `stall` flushes half a file then waits for request cancellation; its background-context installer must finish before the independent watchdog, which is failure rather than success.
- Addressed: request Need's unavailable reason, source/stalled message, no partial directory and immediately reusable lock are observed from real subprocess results, directory inspection and nonblocking flock. The named default is asserted separately, and the internal duration override is actually invoked by the supplied worker, not left to builder-created tests.
- Addressed: all supplied Synthetic acceptance cases remain executable: `slow` sends 8-byte chunks at 100ms intervals, below the injected 600ms idle period but exceeding it in total; `handoff` launches two independent processes sharing a home with separate stalled/healthy loopback origins and counts the second process's stderr notice exactly once. The first must fail and the second install successfully.
- Addressed: supplied cancellation counterexample remains both explicit cancellation and deadline expiry mid-download (`cancel`, `deadline`), retaining existing reasons without the stall message. No user setting is added. Exact slug, file paths, step filename prefix and sentence prefix are retained. README checks and .kogen/project.yaml remain unchanged. Nothing is omitted, conflicting or superseded; duration, method and notice wording settle previously unspecified technical literals without changing scope.

## Tests
- A no-deadline half-body stall returns unavailable with source and stalled message within the injected bound plus scheduling tolerance: supplied subprocess `stall` acceptance and implementation regression (regression)
- Positive reads refresh the interval even when total duration exceeds it: supplied local-origin `slow` acceptance and implementation tests just below the idle boundary and at/above expiry with scheduling tolerance (integration)
- Named default and internal per-adapter duration seam work without user configuration: acceptance checks the named default and invokes the setter in each worker; stalled installation must finish with the injected interval rather than the production default (integration)
- Failure removes partial state and makes the exclusive lock immediately acquirable: acceptance checks directory contents and nonblocking flock after return (integration)
- A second independent process acquires the failed owner's lock and installs from a healthy origin: supplied `handoff` acceptance (integration)
- Waiting notice appears exactly once for contention and never for uncontended installs: acceptance counts configured worker stderr (scenario)
- Mid-download cancellation and deadline retain existing classifications without stall wording: supplied `cancel` and `deadline` acceptance (regression)
- Pin, digest, size, version checks and successful publication remain unchanged: retain runtime tests and configured Go checks (existing)

## Feasibility
- Inspected README, project configuration, runtime.go, runtime_test.go and existing step conventions. Current io.Copy has no idle timeout; lockInstall polls every 50ms without a notice. Existing deferred cleanup is reusable. Required implementation edits are unprotected.
- Documentation search discovered https://pkg.go.dev/net/http; fetch returned status retrieved and marked untrusted. Returned Request context documentation describes cancellation covering response-body reads. It is technical data only, not scope authority or instructions.
- Focused existing `go test ./executor/claudecode -run '^TestPinTable$' -count=1` passed (probe: exit 0, 1.3 s). Acceptance compiles supplied tests and consumes a JSON report, not runner summary text or unwritten builder test names.
- Quint typecheck and 100 samples/20 steps/seed 17 passed (probe: exit 0, 1.2 s). Earlier absolute scratch path refusal and built-in-name fail parse rejection were corrected, not claimed as support.
- evidence: {"id":"report-observer","kind":"observer","inputs":["features/steps/k-exec-install-download-stall__driver.js","features/steps/k-exec-install-download-stall__steps.js"],"observers":["features/steps/k-exec-install-download-stall__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-install-download-stall__steps.js good","exit":0,"output":"good fixtures accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-install-download-stall__steps.js bad","exit":1,"output":"bad fixtures rejected\n"}]}
