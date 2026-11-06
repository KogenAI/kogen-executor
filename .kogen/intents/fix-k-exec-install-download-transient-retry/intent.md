# Record download review finding as not reproduced

Slug: fix-k-exec-install-download-transient-retry
Model: not applicable — the finding does not reproduce, so no product behavior or state changes; the scenarios only record the unchanged behavior of one download attempt loop
Acceptance:
- .kogen/intents/fix-k-exec-install-download-transient-retry/acceptance.feature
- features/steps/fix-k-exec-install-download-transient-retry__steps.js
- features/steps/fix-k-exec-install-download-transient-retry__driver.js

An automated review of the landed k-exec-install-download-transient-retry commit made two claims about `downloadBinary` in executor/claudecode/runtime.go, neither of them reproduced yet:
1. "It calls `http.DefaultClient.Do` directly, skipping `a.get` and any user agent, redirect, loopback or timeout policy."
2. "`err.(*sys.Error)` is an unchecked assertion that panics on any other error type."

It proposed this fix: route the request through `a.get`, and use `errors.As`. The request says to reproduce the finding first with a test that fails on current main. If the scenario does not hold on main, it says to stop and report that the finding does not reproduce, with no code change.

**Neither claim reproduces on current main (55ca508).**
- Claim 1: `downloadBinary` reaches `http.DefaultClient.Do` only through `a.doBounded`, and `a.get` calls that same function. Neither path sets a User-Agent, a redirect policy or a loopback restriction, and both have the same header bound, so `downloadBinary` skips no policy that `a.get` applies. (evidence: executor/claudecode/runtime.go)
- Claim 2: the assertion `err.(*sys.Error)` in `install` runs only after `downloadBinary` returned `retry == true`. Every such return is built by `fail`, then `unavailable`, then `executor.Fail`, and `executor.Fail` returns `*sys.Error`. So no other error type can reach the assertion. (evidence: executor/claudecode/runtime.go; executor/executor.go)
- A scripted-transport capture through `ensureRuntime` on unchanged main confirmed both points. The binary requests and the manifest request had the same headers and redirect handling. Every retryable failure kind ended without a panic as a typed `*sys.Error`. (evidence: features/steps/fix-k-exec-install-download-transient-retry__driver.js; executor/claudecode/runtime.go)

**Outcome: no code change.** executor/claudecode/runtime.go, its tests and every other product, test, documentation and configuration file stay byte-for-byte as they are. The proposed fix is not applied, because the request makes it conditional on reproduction. This change adds only this Intent and its acceptance files. They record the two claims against the unchanged tree, and they pass there. That is the requested report that the finding does not reproduce. The Build makes no implementation edit and does not add executor/claudecode/intent_download_policy_capture_test.go, because the acceptance overlay supplies that path.

## Decisions
- The review finding does not reproduce on main, so the Intent makes no product code change; it records the non-reproduction with acceptance that passes on unchanged main (decision: D1, round 1) (constraint: No edit to executor/claudecode/runtime.go or any other product, test or doc file) (constraint: Build must not add executor/claudecode/intent_download_policy_capture_test.go (overlay path)) (evidence: executor/claudecode/runtime.go; executor/executor.go; executor/claudecode/runtime_test.go; .kogen/intents/k-exec-install-download-transient-retry/intent.md; .kogen/intents/fix-k-exec-install-download-stall/intent.md; features/steps/fix-k-exec-install-download-stall__driver.js) (assumption: Whether Kogen's Build accepts an empty implementation delta is not known; the request explicitly asks for no code change in this case.) (source: request)
- Acceptance drives ensureRuntime through a go test -overlay capture test with a scripted http.DefaultClient transport, as the landed fix-k-exec-install-download-stall acceptance does, and declares final-byte observer controls (decision: D2, round 1) (constraint: Go commands ran only in a git archive export under /private/tmp with GOFLAGS=-mod=readonly; the checkout stayed clean (the previous attempt failed by changing go.sum)) (evidence: features/steps/fix-k-exec-install-download-stall__driver.js) (source: request)
- Reproduce first. The scenario does not hold on main, so stop and report non-reproduction with no code change: neither the `a.get` routing nor the `errors.As` edit is made. (source: request)
- Keep every existing test green and make no unrelated changes. Nothing outside this Intent's acceptance files changes. (source: request)
- The acceptance scenarios expect the outcomes observed on unchanged main, so a later change that introduced either reported defect would fail them. (evidence: features/steps/fix-k-exec-install-download-transient-retry__driver.js; executor/claudecode/runtime.go) (source: request)

## Source comparison
- Not reproduced: "calls `http.DefaultClient.Do` directly, skipping `a.get` and any user agent, redirect, loopback or timeout policy". Acceptance scenario `redirect` and the `sameShape` check on every row cover it, and row `silent-headers` covers the header bound. (evidence: executor/claudecode/runtime.go; features/steps/fix-k-exec-install-download-transient-retry__driver.js)
- Not reproduced: "`err.(*sys.Error)` … panics on any other error type". Rows `http-503`, `http-429`, `transport-error`, `body-error` and `silent-headers` exhaust every retryable path. Each requires no panic and a typed error. (evidence: executor/claudecode/runtime.go; executor/executor.go; features/steps/fix-k-exec-install-download-transient-retry__driver.js)
- Not applied: "Route the request through `a.get`. Use `errors.As`." The request applies the fix only after a reproduction, and there is none.
- Addressed: "Keep every existing test green; no unrelated changes". No product or test file changes.
- Retry note: the previous attempt failed because the external shaping session changed go.sum in the checkout. In this session Go ran only in a `git archive HEAD` export under /tmp, and the checkout stayed clean.

## Tests
- Every retryable binary download failure ends as a typed refusal, never a panic: acceptance rows `http-503`, `http-429`, `transport-error`, `body-error` and `silent-headers`, plus the existing TestDownloadTransportErrors, TestDownloadRetryTimingAndFreshBody and TestDownloadHeaderTimeoutRetriesSilentBinary (existing)
- Binary and manifest requests use the same client, headers, redirect handling and header bound: acceptance scenario `redirect` and the `sameShape` check on every row, plus the existing TestDownloadHeaderTimeoutSilentManifestIsSingleAttempt (existing)

## Feasibility
- Inspected README, .kogen/project.yaml, executor/claudecode/runtime.go, executor/executor.go, executor/claudecode/runtime_test.go, and the k-exec-install-download-transient-retry and fix-k-exec-install-download-stall Intents and their drivers.
- Non-reproduction probe: the submitted driver ran on unchanged main (55ca508, go1.27.2, node v24.21.0), in a `git archive HEAD` export under /private/tmp with `GOFLAGS=-mod=readonly` and never in the checkout. All six modes produced the reports that the acceptance rows expect. The driver's observer controls embed those reports. These were external-session probes, not Kogen probe records. (evidence: features/steps/fix-k-exec-install-download-transient-retry__driver.js)
- No external documentation lookup was needed. The scripted transport replaces `http.DefaultClient`, so no network is used.
- evidence: {"id":"download-policy-observer","kind":"observer","inputs":["features/steps/fix-k-exec-install-download-transient-retry__driver.js"],"observers":["features/steps/fix-k-exec-install-download-transient-retry__driver.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-k-exec-install-download-transient-retry__driver.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-k-exec-install-download-transient-retry__driver.js bad","exit":1,"output":"observer rejected all mutations\n"}]}
