# Check unanswered guarded calls at result

Slug: k-exec-unanswered-guarded-call-at-result
Model: .kogen/intents/k-exec-unanswered-guarded-call-at-result/model.qnt invariants=GuardBeforeAccept,ReportUnanswered seed=41 samples=100 steps=20
Acceptance:
- .kogen/intents/k-exec-unanswered-guarded-call-at-result/acceptance.feature
- features/steps/k-exec-unanswered-guarded-call-at-result__steps.js

Close the Claude Code executor's hook-liveness gap at accepted round results. Currently executor/claudecode/stream.go checks guarded calls only at tool_result, and pending calls only on the usage-limit error path. Before accepting any ending (finish, no_call, blocker), check each pending Write, Edit, MultiEdit and NotebookEdit exactly once against the real hook log and its target snapshot captured at tool_use. Do not recheck answered calls. Preserve existing answered-call validation, result validation and error-result handling, including the usage-limit unfinished-call stop. This is not a new retry or recovery path.

No record plus a changed or unobservable target fails with the existing missing-hook executor/protocol diagnostic naming the tool and call id. Deny plus a changed target fails with the existing denied-but-ran diagnostic. Treat inability to establish unchanged state conservatively with the existing target observation semantics. Allow accepts regardless of target change. No record plus demonstrably unchanged target, or deny plus unchanged target, accepts. Emit exactly one executor_tool event for each accepted unanswered guarded call, with its name, tool_use_id, round, captured arguments, denied status and unanswered:true; do not invent a tool result. Denied is true only for a deny record. Hook records retain existing executor_hook reporting conventions. Unguarded unanswered calls retain current behavior (no executor_tool event). Reuse the existing bounded target observation and sentinel log validation rather than weakening them.

## Decisions
- Preserve success for a harmless unanswered guarded call, but report it rather than silently dropping it. (source: request)
- Fail closed for missing hook evidence when the target changed or cannot be observed; preserve hook denials. (source: request)
- Keep unguarded unanswered calls and answered guarded calls unchanged. (source: request)

## Source comparison
- Addressed: request Problem and Need are implemented by the pre-acceptance pending-call validation above, replacing the current silent acceptance gap without changing usage-limit semantics.
- Addressed: synthetic examples 1–5 are executable scenarios below: missing-hook creation, untouched target, denied creation, allowed creation and unanswered Read. Additional rows preserve deny-unchanged and unobservable outcomes, all four guarded names, and accepted endings.
- Addressed: existing answered guarded tests remain required by the configured Go suite; a real answered allow call in acceptance also prevents accidental duplicate unanswered reporting.
- Addressed: supplied slug, Intent paths, direct features/steps naming and sentence prefix are retained in Acceptance. README commands and docs/testing-rules.md apply unchanged. No requested behavior is omitted or superseded.

## Tests
- Reject unanswered guarded calls with missing hook evidence and changed or unobservable targets: fake-stream regression scenarios for Write, Edit, MultiEdit and NotebookEdit (regression)
- Reject unanswered denied calls that changed their targets: real deny-hook fake-stream scenario (regression)
- Accept and report harmless unanswered guarded calls exactly once with their denial state: absent-hook untouched and deny untouched fake-stream scenarios (integration)
- Accept and report allowed unanswered calls even when changed, at every accepted ending: allow-hook finish, no_call and blocker scenarios (integration)
- Preserve unguarded unanswered calls: unanswered Read scenario (regression)
- Preserve answered guarded validation without duplicate pending events: answered allow scenario and existing claudecode hook tests via configured go-test (existing)

## Feasibility
- The local Quint model typechecked successfully with the bundled Quint CLI (probe: exit 0). No external protocol change or provider lookup is needed: this is local stream/hook bookkeeping exercised through a fake runtime.
- An initial probe attempted to address retained proposal files in scratch; they are not copied there and Node reported MODULE_NOT_FOUND. It is not capability evidence; the following final-byte observer checks run against submitted files.
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-unanswered-guarded-call-at-result__steps.js"],"observers":["features/steps/k-exec-unanswered-guarded-call-at-result__steps.js"],"checks":[{"name":"good","command":"node features/steps/k-exec-unanswered-guarded-call-at-result__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"node features/steps/k-exec-unanswered-guarded-call-at-result__steps.js bad","exit":1,"output":"observer rejected bad controls\n"}]}
