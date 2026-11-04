# Detect hookless Shape writes that ran

Slug: k-exec-shape-hookless-success
Model: not applicable — this changes classification of a completed call using its existing result and target snapshot, not the session state machine
Acceptance:
- .kogen/intents/k-exec-shape-hookless-success/acceptance.feature
- features/steps/k-exec-shape-hookless-success__steps.js

Check the outcome before treating a missing hook as a Shape configuration denial. In executor/claudecode/stream.go toolResults, a guarded Shape call without a hook record must stop with executor/protocol if its result is successful OR its target cannot qualify as unchanged. Only an error with an unchanged target may take the existing Shape configuration-denial path. Do not emit a configuration deny hook event or a denied tool event for a call that triggers this protocol stop. Retain existing hook checks and target observation semantics, including absent-to-file changes; do not change tool availability, permissions, or other roles' behavior.

## Decisions
- Use synthetic children and temporary targets, with no live provider requests. (source: request)
- Preserve Build and Review hook-liveness behavior, including successful hookless-write rejection. (source: request)

## Source comparison
- Addressed: request Problem and Need replace unconditional Shape missing-hook denial at stream.go:331–335 with result/target validation; the outcome paragraph and all acceptance rows specify the complete replacement.
- Addressed: synthetic acceptance success with changed target, error with changed existing and previously absent targets, and error with unchanged target are explicit feature rows; success with unchanged target additionally isolates the success predicate.
- Addressed: request preservation of Build and Review is covered by successful-hookless and unchanged-error rows for each role. Their existing rejected_before_hook reporting is retained, not converted into Shape denials.
- Omitted: none of the requested behavior or supplied reproducing cases. The requested slug, paths, step prefix and filename convention are preserved. No external protocol changes or new settings are introduced.

## Tests
- Successful hookless Shape write must stop without a false denial: synthetic adapter Round regression with changed and unchanged targets (regression)
- Error result with changed target must stop, including absent-to-file: synthetic adapter Round regression and deterministic snapshot tests added by Build (regression)
- Error result with unchanged target remains a configuration denial and completes: synthetic adapter Round check (integration)
- Build and Review retain successful-call rejection and unchanged-error pre-hook rejection handling: synthetic adapter Round checks plus existing hook tests (integration)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-shape-hookless-success__steps.js"],"observers":["features/steps/k-exec-shape-hookless-success__steps.js"],"checks":[{"name":"good","command":"node features/steps/k-exec-shape-hookless-success__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"node features/steps/k-exec-shape-hookless-success__steps.js bad","exit":1,"output":"observer rejected bad controls\n"}]}
