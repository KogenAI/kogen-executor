# Bound persisted round artifacts

Slug: k-exec-round-files-bounded
Model: .kogen/intents/k-exec-round-files-bounded/model.qnt invariants=Bounded,Accounted,Truncated seed=7 samples=50 steps=20
Acceptance:
- .kogen/intents/k-exec-round-files-bounded/acceptance.feature
- features/steps/k-exec-round-files-bounded__steps.js

Bound each Claude Code round's redacted stream and stderr persistence independently, replacing the currently unbounded cumulative writes to `round-N.jsonl` and `round-N.stderr` in the executor artifact directory. A long stream or repeating stderr warning must not fill the host disk. Persistence limits are observational, not execution limits: retain existing parsing, hook-liveness enforcement, result/claim, usage, process draining and round outcomes. Do not change the existing individual stream-line limit or introduce provider calls or extra settings.

## Decisions
- Provide generous documented per-file byte defaults and adapter-option overrides; continue execution on truncation and omit truncation telemetry entirely under cap. (source: request)
- Keep one final marker per truncated file; preserve redaction before persistence, even when secrets occur past the cutoff or across stderr writes. Failure excerpts retain the last kept bytes plus the marker. (source: request)

Technical settlement: add signed integer Options fields `StreamPersistBytes` and `StderrPersistBytes`; values <=0 select defaults of 64 MiB (67108864 bytes) and 8 MiB (8388608 bytes), respectively. No unlimited setting is needed. Document these defaults, option semantics, marker formats, and terminal-event fields in Go option comments and docs/executor-contract.md. Limits reset for each round, independently of session continuation.

Count the bytes that would have been persisted **after redaction**, including the stream's appended newline and excluding markers. Keep complete stream lines while their cumulative size fits. On the first line that would exceed the cap, permanently stop saving payload lines for that file, but continue normal parsing/enforcement of every received line. Count every unsaved complete line and its redacted bytes through round termination. Append exactly one JSONL marker at finalization: `{"type":"kogen_persistence_truncated","cap_bytes":4096,"unpersisted_lines":N,"unpersisted_bytes":B}` followed by newline (4096 is replaced with the configured effective cap). Object key order is not contractual. A line larger than the total cap is omitted whole. Do not resume saving later smaller lines. Exactly fitting content is complete, not truncated; flags/markers appear only on an attempted overflow.

For stderr keep the first cap bytes of the redacted byte stream, continually drain/discard the rest, and count discarded redacted bytes. After draining/final redactor flush, append `\n[kogen: stderr persistence stopped at cap_bytes=4096; unpersisted_bytes=B]\n`, substituting effective cap and discarded byte count. The leading newline is a marker separator, not retained payload. Each file is at most its cap plus its one marker (including separator). Markers contain only fixed text and numeric metadata, never discarded content. Finalize markers/counts before emitting terminal telemetry or reading failure excerpts; preserve existing cleanup/deadline behavior and bounded drain lifecycle. The nonzero/no-result failure still includes a bounded tail of retained stderr followed by the marker, not the discarded output. Keep artifact permissions unchanged.

On both `executor_round_ended` and `executor_round_failed`, add `stream_persist_truncated: true` with `stream_persist_unpersisted_bytes: B` only for stream overflow, and `stderr_persist_truncated: true` with `stderr_persist_unpersisted_bytes: B` only for stderr overflow. An unaffected file contributes neither field, not false/zero. Marker counts and event counts agree. Existing terminal usage and claim are unchanged; truncation alone is never a failure. Maintain hook enforcement and malformed-stream rejection beyond the persistence cap. Do not turn this into an in-memory unbounded buffer.

## Source comparison
- Addressed: request Problem (cumulative unbounded stream lines and unbounded stderr, disk-full consequences) is replaced by independent cumulative caps in the outcome and technical settlement above; the existing one-line limit remains.
- Addressed: all five Need bullets map to documented Options/defaults, whole-line stream persistence plus final counted marker without parsing changes, continuously drained stderr plus failure tail, conditional terminal flags/counts, and pre-persistence redaction above.
- Addressed: Synthetic acceptance 1 preserves 100 valid small stream lines, success claim/usage equivalence, 4 KiB cap-plus-marker and positive lost bytes in scenario 1. Synthetic 2 preserves the 1 MiB stderr write and timely success in scenario 2. Synthetic 3 preserves complete under-cap files and absent flags in scenarios 3 and 7. Synthetic 4 preserves nonzero exit without result and bounded marker-bearing error in scenario 4. Synthetic 5 preserves a stored token beyond both caps in scenario 5, with under-cap split-write coverage in scenario 7.
- Addressed: requested slug, artifact paths, direct `features/steps/k-exec-round-files-bounded__steps.js` naming and sentence prefix are used exactly. README testing/check conventions remain in force; no existing protected implementation path needs editing.
- Omitted: no requested behavior. Superseded: only cumulative unbounded persistence, not stream semantics, process limits, stderr-tail intent or redaction. Settled marker formats, defaults and option/event count names resolve unspecified technical details, not a scope reduction.

## Tests
- Independent per-round configurable byte caps and documented defaults: focused persistence boundary tests for cap-1/cap/cap+1, oversized first stream line, permanent stop, independent files, defaults and second-round reset (integration).
- Stream cutoff must not change result, claim, usage or enforcement: synthetic 100-line successful capped/baseline comparison and malformed post-cap regression, plus retain existing hook-liveness tests and add a post-cap missing-hook case (regression).
- Stderr must drain 1 MiB without blocking while keeping a bounded prefix: synthetic fake process round with a ten-second deadline (integration).
- Under-cap files must remain complete with no marker or terminal fields: small complete round and adjacent stderr boundary cases (integration).
- Terminal truncation metadata and final markers must contain exact lost redacted bytes and stream lines on success and failure: compare persisted files and terminal sink events with high-cap baselines (integration).
- Failed no-result round must retain a bounded stderr tail including final marker: synthetic exit 7 after stderr overflow (regression).
- Stored tokens must never reach either file, marker or telemetry, including split stderr writes and beyond-cap content: synthetic stored-token cases under and over cap (regression).

## Feasibility
- Local Go adapter behavior only; no new external protocol/library dependency or live-provider lookup required. Inspected Options, session.Round/runRound, roundRun parsing, existing fake process/harness, README and configured runner.
- Quint final model typechecked and ran 50 samples/20 steps with seed 7 successfully (probe 3: exit 0, 1.0 s). Earlier drafts failed on a reserved identifier and action-expression parentheses; final bytes correct those errors. The model abstracts either whole-line or prefix persistence at cap 4, with parsing accounting continuing after cutoff.
- A scratch attempt to read the privately retained proposal from the scratch copy failed because that private path is not copied (probe 4: exit 1, 0.1 s); this is not fixture or capability evidence. Native readiness exercises the submitted driver.
- evidence: {"id":"persistence-observer","kind":"observer","inputs":["features/steps/k-exec-round-files-bounded__steps.js"],"observers":["features/steps/k-exec-round-files-bounded__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-round-files-bounded__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-round-files-bounded__steps.js bad","exit":1,"output":"observer rejected bad\n"}]}
