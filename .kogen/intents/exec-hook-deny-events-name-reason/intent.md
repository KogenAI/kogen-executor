# Name reason and path in hook denial events

Slug: exec-hook-deny-events-name-reason
Model: not applicable — a stateless telemetry change: the run-log event built from one hook record gains fields
Acceptance:
- .kogen/intents/exec-hook-deny-events-name-reason/acceptance.feature
- features/steps/exec-hook-deny-events-name-reason__steps.js

When the Claude Code executor's pre-tool hook denies a call, the run log's `executor_hook` event records only `decision: deny`; the reason and path are only in the hook log file (`hook-log.jsonl` in the executor artifact directory). This change makes every `executor_hook` event for a denial carry its own `reason` and `path`, in both places `executor/claudecode/stream.go` emits the event from a hook record (`toolResults` and `checkUnanswered`).

Boundaries: run-log telemetry only. The hook's decisions, the sentinel record, the hook log file, `executor_tool` events (including `denied`, `rejected_before_hook`, `arguments`), the protocol failures for a denied call that ran or a guarded call without a hook record, result.json, exit codes and every Kogen decision stay unchanged. The Shape-role `hook: configuration` denial event stays as it is. The model-facing permission decision reason stays `Kogen: ` followed by the reason. The reason text is not redacted, extended or bounded here beyond what the hook log already holds. No new configuration, setting or environment variable; no change to docs or the consumer contract (the keys are additive on an event consumers treat as open JSON).

## Decisions
- When the record's decision is `deny`, the `executor_hook` event carries `reason` (the record's Reason, verbatim) and, only when the record's Path is non-empty, `path` (the record's Path, verbatim); with an empty Path the event has no `path` key. (evidence: executor/claudecode/stream.go; executor/claudecode/hook.go) (source: request)
- One helper builds the `executor_hook` event from the sentinel record and both emission places call it, so they cannot drift apart. (evidence: executor/claudecode/stream.go) (source: request)
- An `allow` event keeps exactly its current keys: event, round, tool_use_id, tool_name, decision, hook. (evidence: executor/claudecode/stream.go) (source: request)
- The Build adds one new focused, model-free Go test file in executor/claudecode, next to adapter_test.go and unanswered_test.go, using their fixtures only: newHarness, oneRound, conformance.RoundScript with conformance.WriteAction and conformance.ProtectedPath, h.eventsNamed, and, for the unanswered path, the session and roundRun construction with appendSentinel exactly as TestUnansweredHookEvents builds it. The tests are TestHookDenyEventNamesProtectedPath, TestHookDenyEventOutsideCheckoutReason, TestHookDenyEventUnansweredCall and TestHookDenyEventWithoutPathOmitsPath. (evidence: executor/claudecode/unanswered_test.go; executor/claudecode/adapter_test.go) (source: request)
- The acceptance scenarios additionally drive the real adapter through its public API with a synthetic fake Claude and the real hook (the pattern of the existing unanswered-call step file), because the named Go tests do not exist before the Build. The driver sets the runtime size-check seam environment variable in its own process, as the existing tests do; this is test-only and adds no product setting. (evidence: executor/claudecode/runtime.go; features/steps/fix-k-exec-unanswered-guarded-call-at-result__steps.js) (assumption: the user confirms the seam may be used by the acceptance driver) (source: request)

## Source comparison
- Addressed: expected 1 (reason and path on deny in both emission places): acceptance scenarios 1-4 and the Go tests; the unanswered path is scenarios 3 and 4.
- Addressed: expected 2 (single helper): reviewed in the Build and kept honest by scenarios 3 and 4 failing if one place drifts.
- Addressed: expected 3 (allow unchanged): scenario 5 checks the exact key set.
- Addressed: expected 4 (model-facing text unchanged): scenario 5 reads the real hook output and expects `Kogen: ` plus the reason.
- Addressed: scenario 2's distinction from the tool result text `PreToolUse:Write hook error: denied`.
- Omitted: wrong-implementation overlays (controls deferred, see controls.json).
- Observed bare denial record (AoR h11, run-log log.jsonl line 100): `{"at":"2026-11-15T15:13:35.844805Z","decision":"deny","event":"executor_hook","hook":"pretool","round":1,"tool_name":"Write","tool_use_id":"toolu_01LCu3WDRNZv2dnCim8MffhF"}`
- Matching hook-log.jsonl record content in that run: `"path":"/private/tmp/billing_scratch/b_test.rb","decision":"deny","reason":"the path is outside the checkout"`
- Second observed denial (AoR h12): a Write to `.../lanes-cell-hcu7gg63/app/models/event/webhookable.rb.tmp`, reason `the path is outside the checkout`.
- The hook's `decide` function returns exactly these reasons, which the event carries verbatim: `the tool call names no file path`; `this role is read-only: it may not change the checkout`; `the path is outside the checkout`; `this is the executor artifact directory (` followed by the directory and `)`; `paths under .git are not editable`; `this is a protected path (` followed by the entry and `)`; `this is a hard link to a protected path (` followed by the entry and `)`.
- Go-test sentinel records (unanswered path), as the request states them: `{Nonce: "n", Hook: "pretool", ToolUseID: "deny", Decision: "deny", Path: "/repo/b.txt", Reason: "paths under .git are not editable"}` and, for the no-path case, `{Nonce: "n", Hook: "pretool", ToolUseID: "deny", Decision: "deny", Reason: "the tool call names no file path"}`.

## Tests
- A denial of a protected file names its reason and path. Round script: one Write action (conformance.WriteAction) to conformance.ProtectedPath with content `tampered`, then End finish. The single `executor_hook` deny event has `reason` `this is a protected path (protected/contract.txt)` and `path` equal to the `path` of the one deny record in the hook-log.jsonl under h.task.Dir (read the file, do not rebuild the string): TestHookDenyEventNamesProtectedPath (unit)
- A denial outside the checkout shows the hook's reason, not the tool-result text. Round script: one Write action with Path `../outside.txt`, then End finish. The deny event `reason` is `the path is outside the checkout`, not `PreToolUse:Write hook error: denied`: TestHookDenyEventOutsideCheckoutReason (unit)
- A denial reported only at the round's result carries the same fields: built with the session and roundRun and appendSentinel as TestUnansweredHookEvents does, one pending Edit call whose sentinel is `{Nonce: "n", Hook: "pretool", ToolUseID: "deny", Decision: "deny", Path: "/repo/b.txt", Reason: "paths under .git are not editable"}`; the deny event has that reason and path: TestHookDenyEventUnansweredCall (unit)
- A denial whose record has no path has no `path` key: same construction with sentinel `{Nonce: "n", Hook: "pretool", ToolUseID: "deny", Decision: "deny", Reason: "the tool call names no file path"}`; the event has that reason and the map has no `path` key: TestHookDenyEventWithoutPathOmitsPath (unit)
- Allow events keep their keys and model-facing text is unchanged: the acceptance scenario "Allow events keep their keys" and the existing hook and adapter tests (existing)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/exec-hook-deny-events-name-reason__steps.js"],"observers":["features/steps/exec-hook-deny-events-name-reason__steps.js"],"checks":[{"name":"good","command":"node features/steps/exec-hook-deny-events-name-reason__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"node features/steps/exec-hook-deny-events-name-reason__steps.js bad","exit":1,"output":"observer rejected bad controls\n"}]}
- The scratch driver was run on the unchanged tree for the protected-file, `.git/config` and no-path fixtures: the round succeeded and the deny `executor_hook` event was bare (decision, event, hook, round, tool_name, tool_use_id), so the scenarios are legitimately red on the missing feature.
