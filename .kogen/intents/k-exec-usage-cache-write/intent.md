# Report executor cache writes separately

Slug: k-exec-usage-cache-write
Model: not applicable — this is a per-result projection, not a new lifecycle or state machine
Acceptance:
- .kogen/intents/k-exec-usage-cache-write/acceptance.feature
- features/steps/k-exec-usage-cache-write__steps.js
- features/steps/k-exec-usage-cache-write__goldens.js

Add nullable `CacheWrite *int` with JSON key `cache_write` (not omitted when nil) to executor.Usage. Map Claude Code's reported cache_creation_input_tokens independently into it, preserving existing count validation. Include it in usage events on successful and failed rounds. Document it in docs/executor-contract.md and extend executor/conformance coverage. Input remains the sum of fresh input, reads and creation only when all three counts are reported; Cached remains reads alone. Never default absent writes to zero. Preserve other fields and cost-baseline behavior. Creation-only usage is partial; absent usage is unknown.

Rebuild on current main (inspected revision eb73f9b7cd576c248f5c50963169386d25dbf96f). Delivery on 2026-11-04T02:48:56Z reported regressions in `kogen-build TestNativeConformance` and `kogen-build TestNativeConformance/finish_after_write`, land log k-exec-usage-cache-write-20261104T003802Z.log. Preserve native compatibility: the optional count must not become a requirement for all executors to report complete usage. Do not require CacheWrite present or zero for existing shared scripts such as finish_after_write. Scope new write-specific conformance assertions to fixtures that actually report it. Existing ScriptUsage literals and native drivers must stay source- and behavior-compatible. No deliberate native consumer expectation change is intended. If implementation nevertheless deliberately alters a consumer assertion, final summary must end with one line per affected test: `consumer-first: <consumer repo> <test>: <what the consumer should stop pinning>`; otherwise fix the producer regression, not its consumers.

## Decisions
- Report nullable cache_write on successful and failed usage, retaining input and cached meanings (source: request)
- Existing usage goldens change only by the additive field; document and test the executor contract (source: request)
- Actual external `kogen-build TestNativeConformance` and `TestNativeConformance/finish_after_write` results require delivery/maintainer evaluation in that consumer repository, which is not present here. No local scenario claims to prove those external tests pass; retain this external evaluation requirement, not a fabricated local passing result (source: request)

## Source comparison
- Addressed: Problem/Need map to independent nullable mapping, public Usage and both terminal event paths above and the adapter examples in acceptance.feature.
- Addressed: all synthetic examples are executable: 10/700/300/5 produces 1010/700/300/5 complete; missing reads keeps writes and yields null input; absent usage yields null writes unknown; failed result retains writes. Creation-only and explicit zero distinguish partial from unknown and missing from zero.
- Addressed: golden-only addition has an executable baseline comparison for existing failed-round usage goldens; retain all other usage checks and update any other affected usage goldens additively too.
- Addressed: retry's current-main instruction and named native consumer counterexample map to compatibility requirements and the explicit external evaluation decision. No external passing result is claimed. The conditional consumer-first summary format is retained.
- Omitted: no requested product behavior. Historical provider/cache/UI narratives in the supplied testing policy are not authority to change transport or probe live accounts for this local projection.

## Tests
- Independently expose reported creation while retaining the three-part input sum: extend TestUsageMapping and focused mapUsage cases with 10/700/300/5 (unit)
- Preserve writes with missing reads, including creation-only partial and explicit zero, and absent writes null: mapping cases and adapter examples (unit)
- Carry writes through successful RoundResult and terminal events and failed events: real adapter with contract fake in acceptance (integration)
- Preserve existing fields, cost behavior and usage goldens except the new field: golden baseline scenario plus existing cost and usage regressions (regression)
- Extend conformance for explicitly reported writes without requiring them from native drivers or finish_after_write: retain existing shared-script assertions and add scoped write fixtures (regression)

## Feasibility
- Existing TestUsageMapping ran successfully via `go test -count=1 -v -run '^TestUsageMapping$' ./contract` (exit 0); this establishes the local fake and runner summary. An earlier guessed TestClaudeCodeUsage filter ran zero tests and is not behavioral evidence.
- evidence: {"id":"usage-observer","kind":"observer","inputs":["features/steps/k-exec-usage-cache-write__steps.js"],"observers":["features/steps/k-exec-usage-cache-write__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-usage-cache-write__steps.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-usage-cache-write__steps.js bad","exit":1,"output":"rejected\n"}]}
- evidence: {"id":"golden-observer","kind":"observer","inputs":["features/steps/k-exec-usage-cache-write__goldens.js","executor/claudecode/failed_round_usage_test.go"],"observers":["features/steps/k-exec-usage-cache-write__goldens.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-usage-cache-write__goldens.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-usage-cache-write__goldens.js bad","exit":1,"output":"rejected\n"}]}
