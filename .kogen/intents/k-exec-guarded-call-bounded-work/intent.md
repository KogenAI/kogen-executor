# Bound guarded-call observation work

Slug: k-exec-guarded-call-bounded-work
Model: .kogen/intents/k-exec-guarded-call-bounded-work/model.qnt invariants=CursorWithinComplete,StopExcludesAllow seed=1 samples=100 steps=20
Acceptance:
- .kogen/intents/k-exec-guarded-call-bounded-work/acceptance.feature
- features/steps/bounded_guard.js
- features/steps/bounded_guard_test.go.txt

Bound synchronous file observation on the Claude Code stream/cancellation loop. Replace unbounded target hashing and repeated whole-log reads in guarded tool result handling; do not change the external executor interface, hook wire format, runtime/provider integration or protection policy. This is local work using synthetic fixtures, not a live Claude run.

For Write, Edit, MultiEdit and NotebookEdit, observation of a regular target reads at most 1 MiB (1048576 bytes), both at announcement and during the unchanged check. Stat first: a larger target is not observable, not an absent target and not an unchanged target. Bound the actual read even if a file grows after stat. At or below the limit preserve the mode, size, modification-time and SHA-256 comparison and existing absent-target behavior. Document the limit and consequence in the adapter's maintained documentation/comments: absent hook evidence on an oversized target cannot use the rejected-before-hook exception, even if the tool reports an error; it stops the round as executor/protocol. Shape's existing configuration-denial exception remains unchanged.

Keep a round-local incremental hook-log cursor and matching-nonce record index. Read only newly appended bytes; each complete record is parsed once across the round rather than once per result. Retain a partial final line until its newline arrives and then parse it once. Do not accept stale nonces. Preserve existing handling of empty, malformed and irrelevant records, missing log files and read errors; keep existing last matching record semantics. Scope state to a round so a cursor/index does not leak between rounds/nonces. Avoid new public settings, dependencies or production abstractions solely for testing. The synthetic byte-counter tests are an allowed observation of the explicit work bound, not a prescribed helper structure.

Every existing guarantee stays: an ordinary guarded call without a hook record stops; a hook denial whose call ran stops; a pre-hook rejection of an unchanged observable target is allowed. Denials that blocked the call remain normal denied-tool events. Cancellation and deadline behavior and process-group cleanup must remain responsive with large targets; retain normal KillGrace rather than increasing it to conceal hashing latency.

## Decisions
- Preserve all current hook safety decisions and stale-nonce filtering; make over-limit targets explicitly not observable, with no permissive fallback. (source: request)
- Use small synthetic fixtures for many thousands of records, limit boundaries, partial appends and cancellation, with no network or model calls. (source: request)
- Set the fixed digest cap to 1 MiB; it is an internal technical bound, not a new user-facing setting. (source: request)

## Source comparison
- Addressed: request Problem's whole-target hashing on announcement and repeated whole-log parsing at results are replaced by bounded observation and incremental per-round reading (contract paragraphs 2–3; target/log scenarios). Current evidence is executor/claudecode/stream.go observePath and toolResults and hook.go readSentinels.
- Addressed: request Need's missing-record stop, denial-that-ran stop, unchanged-observable pre-hook exception and stale-nonce exclusion remain explicit (contract paragraphs 2–4; protocol/unchanged scenarios).
- Addressed: synthetic acceptance (1) uses 10000 records and 100 guarded results with actual read-byte accounting; (2) includes limit+1 and a 16 GiB sparse file, observes target classification and protocol stop; (3) checks limit-1 and limit and retained unchanged regressions; (4) checks missing, denial ran, stale nonce and completion of a partial appended line; (5) runs the actual session Round with fake Claude, a huge target and cancellation (all five scenarios and supplied independent Go driver).
- Superseded: the current unbounded regular-file digest and repeated full-log scan are implementation behavior, not preserved product guarantees. A fixed 1048576-byte cap settles the unspecified technical limit. No requested product behavior is omitted; no provider/protocol changes are authorized.

## Tests
- Bound digest reads including a growing-file-safe read cap and limit-1/limit/limit+1 classification: add focused target boundary/read-budget regression and retain unchanged-target checks (regression)
- Treat an oversized pre-hook error as not observable and stop rather than allowing unchanged fallback: synthetic target protocol fixture (integration)
- Read many thousands of records once across guarded results: synthetic 10000-record/100-result read-byte fixture (regression)
- Preserve missing-record stop, denial-that-ran stop, blocked denial and stale-nonce filtering: synthetic stream fixtures and existing hook liveness tests (integration)
- Retain partial appended line and consume its completed record on the next read: incremental append fixture (integration)
- Preserve absent/small-target unchanged rejection exception and changed-target failures: existing TestRejectedBeforeHookContinues and TestHooklessCallStillStops plus boundary fixture (existing)
- Cancellation with a large target returns within normal kill grace plus scheduling allowance: actual session Round with fake Claude and sparse target, 300 ms KillGrace, cancellation at 500 ms and total under 1800 ms (regression)
- Preserve deadline classification and process cleanup: retain TestCancellationClassifiedByContext and process-group tests; run configured checks and README's race suite before delivery (existing)

## Feasibility
- Local inspection found no required protected implementation edits. Production changes belong in executor/claudecode, not the acceptance driver. No external dependency/protocol uncertainty requires documentation research.
- Quint model typechecked and ran 100 samples of 20 steps with seed 1 using TypeScript backend (probe: exit 0). An earlier parse failure from a reserved action name was corrected before the successful run.
- An attempted scratch copy of privately retained proposal paths failed because those paths are not in the scratch checkout; it establishes no fixture support (probe: exit 1).
- evidence: {"id":"guard-observer","kind":"observer","inputs":["features/steps/bounded_guard.js","features/steps/bounded_guard_test.go.txt"],"observers":["features/steps/bounded_guard.js","features/steps/bounded_guard_test.go.txt"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/bounded_guard.js good","exit":0,"output":"guard observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/bounded_guard.js bad","exit":1,"output":"guard observer rejected\n"}]}
