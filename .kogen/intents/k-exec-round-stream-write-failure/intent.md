# Detect failed round artifact writes

Slug: k-exec-round-stream-write-failure
Model: not applicable — error propagation from artifact I/O does not add a meaningful executor state machine
Acceptance:
- .kogen/intents/k-exec-round-stream-write-failure/acceptance.feature
- features/steps/k-exec-round-stream-write-failure__capture.js

Notice failed writes and flushes of both retained artifacts, including partial writes, short writes and final redactor flushes. Choose executor failure, not successful completion with incomplete evidence. Update docs/executor-contract.md accordingly. Fail with executor/failed, naming only the artifact basename and the actual successfully written byte count, never content or secrets. The terminal executor_round_failed event carries artifact (round-N.jsonl or round-N.stderr) and kept_bytes (integer). Do not emit executor_round_ended for such a failure. Count successful returned bytes, not attempted bytes. Finish stderr drainage and process-group cleanup before returning; do not let ignored finalization errors convert a failed persistence operation into success. Apply the same policy to marker writes. Preserve existing intentional byte-cap semantics and redaction-before-persistence. No fsync durability guarantee or provider behavior change is requested.

Keep main's current deterministic token_transport_test.go: it already waits for the child start marker before arming the 300ms cancellation, and the 511/512 cases use a background context. If a necessary repair is demonstrated, synchronize startup or drive transport in process; never increase any deadline, timeout or assertion limit.

## Decisions
- Stop the round with an executor failure for either artifact, including failures discovered during final flush (source: request).
- Keep successful retained bytes and redaction unchanged (source: request).

## Source comparison
- Addressed: the Problem's ignored stream writes and stderr flush become executor failures under the contract above; both artifacts use identical event metadata.
- Addressed: synthetic acceptance uses the existing fake Claude executable, /dev/full as a zero-byte full artifact, synthetic token redaction and process-group disappearance. Implementation regression tests must additionally cover partial writes after N nonzero bytes, flush-only failures and byte-identical successful evidence including stderr; these are not superseded by the zero-byte scenario.
- Addressed: retry findings about JavaScript $$ expansion are avoided by constructing the wrapper directly in Go, with no replacement-string operation.
- Addressed: reviewer findings about token_transport_test.go are satisfied by preserving the deterministic main version, without raising 300ms or 3s limits.
- Omitted: no requested behavior is deliberately removed; successful incomplete-evidence completion is the unchosen alternative explicitly permitted by Need.

## Tests
- Failed retained stream writes stop with artifact and exact kept byte count: full-artifact acceptance plus partial-write regression (regression)
- Failed stderr writes or final redactor flush stop under the same policy: stderr acceptance plus flush-only regression (regression)
- Successful persistence remains byte-identical including synthetic-token redaction: fitting acceptance and before/after byte fixtures for both artifacts (integration)
- Process groups are cleaned on successful and failed persistence: acceptance group-disappearance checks (integration)
- Intentional observation caps retain current behavior: existing persistence tests unchanged (existing)
- Token transport has no startup wall-clock race and no increased limits: existing TestRoundTokenTransport and TestTokenTransportSizeBoundary (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-round-stream-write-failure__capture.js"],"observers":["features/steps/k-exec-round-stream-write-failure__capture.js"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/k-exec-round-stream-write-failure__capture.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/k-exec-round-stream-write-failure__capture.js bad","exit":1,"output":"rejected\n"}]}
