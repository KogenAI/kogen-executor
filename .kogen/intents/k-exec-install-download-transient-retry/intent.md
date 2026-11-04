# Retry transient pinned runtime downloads

Slug: k-exec-install-download-transient-retry
Model: .kogen/intents/k-exec-install-download-transient-retry/model.qnt invariants=bounded,terminal seed=19 samples=100 steps=30
Acceptance:
- .kogen/intents/k-exec-install-download-transient-retry/acceptance.feature
- features/steps/k-exec-install-download-transient-retry__steps.js
- features/steps/k-exec-install-download-transient-retry__driver.js

Replace the single-attempt runtime binary GET in executor/claudecode/runtime.go with bounded transient retries. Keep the install lock from before download through all attempts and pauses, final verification and publication, and remove .partial-* on every terminal outcome. This is not a manifest retry feature; the loop applies to the large pinned binary, not fetchManifest or general get callers. Preserve platform pins, loopback manifest seam, verification, executable permissions, atomic publication and existing error classifications.

Technical settlement: use a named internal base delay of 100 milliseconds, waiting 100ms then 200ms; expose setDownloadRetryDelayForTest(time.Duration) on the adapter, matching the idle test seam convention. Wait with context cancellation, not an unconditional sleep.

## Decisions
- Three total attempts, expressed by a named internal constant; no user configuration. (source: request)
- Retry connection failures before/during the body, unexpected end of body, HTTP 429 and all HTTP 500–599 responses. Never reuse a partial body, hash or byte count; close response bodies, output files and idle timers before retry. (source: request)
- Never retry other HTTP statuses including 403/404, completed size/SHA-256 mismatches, idle stalls, filesystem/verification failures, or context cancellation/deadline. A completed short body is a pin mismatch; a declared Content-Length body terminated prematurely is a transient transport failure. Context classification takes precedence even when a transport error is also available. (source: request)
- Print exactly one stderr line for each failure that leads to another attempt, identifying failed attempt number and cause, containing the word retry. No retry line for a permanent failure or exhausted last attempt. Exhaustion returns unavailable naming the source URL, last cause and `3 attempts`. Preserve the existing `does not match` refusal for completed mismatches. (source: request)

## Source comparison
- Addressed: request Problem and Need's large-file failure and manual rerun are replaced by Decisions' bounded binary-only retry loop; no range/resume or new user setting is introduced.
- Addressed: all six Synthetic acceptance examples map in order to 503-once, disconnect, 503, 404, checksum and cancel rows in acceptance.feature. Source URL, HTTP 503, attempt count, cleanup, installed bytes and retry-line counts are executable observations.
- Addressed: remaining Need categories map to 429-once, connect, 403, size and stall rows, plus required focused implementation tests below for cancellation/deadline, growing waits and lock retention. DNS/connect failures use the same transport-error retry rule, not a provider-specific endpoint.
- Addressed: request paths, slug, step naming/prefix, README Go checks and protection contract are retained. No required implementation edit touches a protected path; runtime.go and adapter test seam fields remain builder-owned.
- Omitted: no requested product behavior. Technical choices settle an otherwise unspecified short pause and wording; no requested behavior is superseded.

## Tests
- Retry 503 then succeed with exactly two binary requests and one stderr retry line: local origin regression acceptance (regression)
- Retry a half-body early close from clean bytes and reverify pin: local origin disconnect acceptance (regression)
- Stop after three transient failures, naming source, last HTTP cause and count with no partial directory: exhaustion acceptance (integration)
- Never retry 403/404 or completed size/checksum mismatch; retain does-not-match refusal: permanent-origin acceptance rows (integration)
- Cancel during the retry pause with existing interrupt classification, immediate return and no next request: cancel acceptance (integration)
- Retry HTTP 429 and pre-body connection failures: local origin acceptance rows and focused transport tests for DNS/connect errors (integration)
- Idle stalls and all context deadlines/cancellations stop without retry or pause: stall acceptance and focused adapter tests before/during body and pause (integration)
- Hold install lock across attempts and pauses and release on completion: add concurrent installer/lock acquisition test in runtime_test.go (integration)
- Three-attempt constant, 100ms/200ms growing pause and delay seam, fresh output/hash/size each attempt: add focused runtime_test.go tests observing request timing and final installed bytes, including recovery followed by completed mismatch (integration)
- Preserve successful install, existing version verification, manifest seam and runtime safeguards: existing runtime_test.go and configured full checks (existing)

## Feasibility
- Model typechecked with Kogen Quint: exit 0, 0.5 s. A scratch attempt to copy retained proposed files failed because proposal storage is not included in probe copies; no product conclusion follows.
- Documentation search returned irrelevant results; fetch https://pkg.go.dev/net/http returned retrieved but untrusted HTML with an injected directive marker. No authority is assigned to that content. Existing Go HTTP fixtures provide the local protocol evidence instead.
- evidence: {"id":"retry-observer","kind":"observer","inputs":["features/steps/k-exec-install-download-transient-retry__driver.js"],"observers":["features/steps/k-exec-install-download-transient-retry__driver.js"],"checks":[{"name":"good","command":"node features/steps/k-exec-install-download-transient-retry__driver.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"node features/steps/k-exec-install-download-transient-retry__driver.js bad","exit":1,"output":"observer rejected all mutations\n"}]}
