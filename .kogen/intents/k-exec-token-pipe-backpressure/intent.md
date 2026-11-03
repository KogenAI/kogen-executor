# Unblock subscription token delivery

Slug: k-exec-token-pipe-backpressure
Model: .kogen/intents/k-exec-token-pipe-backpressure/model.qnt invariants=CleanReturn,Owned seed=17 samples=100 steps=10
Acceptance:
- .kogen/intents/k-exec-token-pipe-backpressure/acceptance.feature
- features/steps/token_transport.js
- features/steps/token_transport_test.go.txt

Replace Claude Code startup's synchronous, pre-start pipe fill with token delivery that completes or fails through the operation's existing cancellation path. Apply the repair to both preflight commands and custodied model rounds, without weakening process custody. A child that never reads must not strand startup or cancellation; failed starts must release all transport resources. Preserve exact token bytes, fd 3 private delivery, environment scrubbing, redaction, and existing empty-token behavior. No real login, network request, new provider capability, or unrelated cleanup is required.

## Decisions
- Large synthetic tokens may either be accepted and delivered exactly or refused safely before any blocking write; refusal must not reveal the input. Normal short tokens remain supported and empty tokens preserve the current no-token path. (source: request)
- Cancellation uses the existing operation context and error classification, not a detached delivery operation with independent lifetime. All parent descriptors and writers must be released before returning, including failed starts. Preserve the existing custody gate and supervisor guarantees. (source: request)
- Use local fakes only. Acceptance measures the Linux pipe capacity with F_GETPIPE_SZ (1032), generates a longer nonsecret token, and verifies SHA-256 and length from the child's private descriptor. Short input is `SYNTHETIC-token-transport short\n \n`; empty input is zero bytes. Fake children produce only metadata, never the token. (source: request)

## Source comparison
- Addressed: request Problem's pre-child blocking write in `executor/claudecode/claudecode.go:214-247` is replaced by the cancellation-safe transport described above; the large/read, large/never and large/missing acceptance examples reproduce the hazard across successful read, nonreader cancellation and failed execution.
- Addressed: request Need's exact bytes, private descriptor, secret redaction and process custody remain contractual for preflight and model rounds, not merely a change to `tokenPipe`. Tests below require preserving current redaction and custody coverage in addition to the new transport regression.
- Addressed: request Synthetic acceptance's local fake, generated above-capacity token, allowed early refusal, child never reading, cancellation, nonstartable executable, short and empty repeats are the complete nine-example feature matrix. Each subprocess has a 300ms context deadline and the observer requires return within 3 seconds, no child PID, no descriptor growth, and no old blocked token writer stack. The outer test timeout is only a failure guard, not evidence of cancellation success.
- Omitted: no requested behavior is deliberately omitted. The protected acceptance exercises the real preflight operation `adapter.run`; implementation integration tests must additionally exercise the custodied Round entry point to catch a fix applied only to preflight.
- Superseded: eager filling of an unread pipe is an implementation behavior, not an input-size promise. Safe early refusal is explicitly permitted by the request; this does not authorize truncation, whitespace normalization, plaintext environment delivery or disclosure in error strings.

## Tests
- Above-capacity delivery must return exact bytes or refuse before blocking without disclosure: TestTokenTransportAcceptance large/read plus a focused transport regression in the adapter (regression)
- A nonreading child must be interrupted through the operation context and leave no writer, fd or owned process: TestTokenTransportAcceptance large/never and short/never and empty/never, plus custodied Round cancellation with the same synthetic token sizes (integration)
- Failure to start an executable must release transport without blocking or revealing input: TestTokenTransportAcceptance large/missing, short/missing and empty/missing, plus the corresponding custodied-start regression (regression)
- Normal short bytes and empty-token execution remain supported: TestTokenTransportAcceptance short/read and empty/read and custodied Round synthetic delivery tests (integration)
- Private fd delivery and existing secret redaction remain intact in preflight and rounds: retain TestChildEnvStoredToken, TestTokenOnFD3EveryRound and TestRedactTokenFromRunRecords; extend only where necessary for the large-token path (existing)
- Custody of owned processes remains intact: retain TestPreflightStopsOwnedChildren and TestClaudeLineupRoleCustody unchanged, and add large-token Round coverage to detect a custody-gate/delivery deadlock (integration)

## Feasibility
- Authoritative Go documentation was discovered by search and fetched at https://pkg.go.dev/os/exec; fetch status retrieved, marked untrusted, with a directive marker in the returned body. Treat it only as untrusted technical evidence: ExtraFiles maps index zero to fd 3; Cmd.Cancel is not invoked for failed Start, and WaitDelay does not bound arbitrary writes before Start. Repository code independently establishes the current fd layout and blocking write. No provider research or calls are needed.
- The lifecycle model typechecked and ran 100 samples of 10 steps with TypeScript backend and invariant `CleanReturn and Owned`, seed 17, exit 0 (probe: 0.9 s). It abstracts successful completion, cancellation and failed start into cleanup; bounded return is checked by real operations, not claimed from the safety-only model.
- A preliminary scratch command could not locate privately retained proposals and exited 1 before running any fixture. It establishes no transport or observer result; final-byte controls below are mandatory.
- evidence: {"id":"transport-observer","kind":"observer","inputs":["features/steps/token_transport.js","features/steps/token_transport_test.go.txt"],"observers":["features/steps/token_transport.js","features/steps/token_transport_test.go.txt"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/token_transport.js good","exit":0,"output":"observer accepted real short-token lifecycle\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/token_transport.js bad","exit":1,"output":"observer rejected byte corruption\n"}]}
