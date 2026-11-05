# Name why a guarded call's hook did not run

Slug: k-exec-hook-failure-cause-visible
Model: not applicable — the adapter only records hook events it already reads and adds a classification to an existing failure; no round transition, stop condition or retry changes
Acceptance:
- .kogen/intents/k-exec-hook-failure-cause-visible/acceptance.feature
- features/steps/k-exec-hook-failure-cause-visible__steps.js

When a guarded write call (Write, Edit, MultiEdit, NotebookEdit) has no hook log record, the Claude Code adapter (`executor/claudecode`) currently stops the round with the `executor/protocol` failure `hook did not run for the <tool> call "<id>"; the round was stopped`, and the `executor_round_failed` event repeats that detail. Neither says why. Claude Code reports its hooks in its `system/hook_started` and `system/hook_response` stream events, but today the adapter accepts these and does nothing else with them. After this change the adapter keeps, for each guarded tool call, the most recent hook start and hook response it attributes to that call. The "hook did not run" failure and its `executor_round_failed` event then name the cause (`hook_cause`) and, when the hook wrote stderr, a bounded and redacted stderr excerpt (`hook_stderr`).

Boundaries: when and whether a round is stopped does not change, and neither does any other failure (denied but ran, unreadable hook log, and so on). How hook events are accepted before init and after the result stays the same, and they still never count in `ignored_events`. A round in which every hook ran gets no new event and no new field. Nothing is retried.

Observed hook event shapes. These come from the pinned Claude Code runtime 2.1.312's own emitter, which the adapter runs with `--include-hook-events`:
- `{"type":"system","subtype":"hook_started","hook_id":<string>,"hook_name":<string>,"hook_event":<string>}`
- `{"type":"system","subtype":"hook_response","hook_id":…,"hook_name":…,"hook_event":…,"output":<string>,"stdout":<string>,"stderr":<string>,"exit_code":<integer, only when defined; may be null>,"outcome":"success"|"error"|"cancelled"}`

`hook_id` is a fresh random id for each hook run. The events carry no `tool_use_id`. `hook_name` is `<hook_event>:<tool name>`, for example `PreToolUse:Write`. The runtime reports a timed-out command hook as `outcome:"cancelled"`, and gives no exit code or a null one.

Attribution. This is the "most recent hook start and response per tool call" bookkeeping. It happens wherever the stream already accepts these two event types:
- A `hook_started` whose `hook_event` is `"PreToolUse"` and whose `hook_name` is `"PreToolUse:<T>"` is attributed to one guarded call: the earliest by tool_use order that is named T, is still pending (its tool_use was seen and no tool_result yet), and has no attributed start. The event's `hook_id` is recorded with the call. If no call qualifies, the event is not attributed.
- A `hook_response` whose `hook_event` is `"PreToolUse"` is attributed to the call whose recorded start has the same `hook_id`. A later response for that id replaces the earlier one. A response that matches no attributed start is not attributed.
- The kept response record holds the `outcome` string, the `exit_code` (only when it is a JSON integer), and the excerpt. The excerpt is computed when the event is read, so memory stays bounded per call.

Excerpt. It is taken from the attributed response's `stderr` string, in this order:
1. The stored token is already replaced by `[redacted]`, because every stream line is redacted before it is parsed.
2. Each secret-named environment value (`secretEnvValues(Options.Env)`) is replaced by `[redacted]`.
3. The result is trimmed of surrounding whitespace (`strings.TrimSpace`).
4. The result is bounded with the existing `bound(s, 200)`: control characters other than newline and tab become spaces, and text over 200 bytes keeps its first 200 bytes on a rune boundary plus `...`.

If the trimmed result is empty, there is no excerpt.

Cause. `hook_cause` is computed for the stopped call at the moment the existing code returns the "hook did not run" failure. That happens in both places it is returned today: at the call's tool_result (`toolResults`) and for a still-pending changed call at an accepted result (`checkUnanswered`). The first rule that matches wins:
1. No attributed start: `not_started`.
2. A start but no attributed response: `no_response`.
3. Response `outcome` is `"timeout"` or `"cancelled"`: `timeout`.
4. Response `exit_code` is an integer: `exit_<code>` in decimal, for example `exit_2` or `exit_0`.
5. Otherwise: `exit_unknown`.

Only a response supplies an excerpt.

Output shapes:
- Error detail: the existing sentence, then `; hook_cause <cause>`, then, only when there is an excerpt, `; hook_stderr ` followed by `strconv.Quote(excerpt)`. Example: `hook did not run for the Write call "hook-call"; the round was stopped; hook_cause exit_2; hook_stderr "kogen executor hook: invalid policy"`. The class and reason stay `executor/protocol`.
- `executor_round_failed`: keeps its existing fields, including `detail` (still `bound(detail, 400)`). It adds `"hook_cause":"<cause>"` and, only when there is an excerpt, `"hook_stderr":"<excerpt>"`. No other event carries either field.

Technical choices made during shaping:
- Redaction. The excerpt is redacted of the stored token and of secret-named environment values. These are the secrets the adapter already redacts in stream-derived telemetry, which is what the request's "secret-redacted" means here.
- `cancelled` maps to `timeout`. The pinned runtime reports a hook timeout as `outcome:"cancelled"`, so both `cancelled` and `timeout` map to `timeout`. Otherwise the requested timeout cause could never appear with the real runtime.
- `exit_unknown`. A response with neither a timeout outcome nor an integer exit code is `exit_unknown`. The runtime omits `exit_code` when it is undefined, and the field still needs a value.
- Attribution keys. Hook events are attributed by the `hook_name` tool suffix, the earliest pending call, and `hook_id`, because the runtime's hook events carry no tool_use_id.
- Excerpt bound. The excerpt is bounded to 200 bytes, so that the detail with a typical excerpt fits within the event's existing 400-byte detail bound.

## Decisions
- Keep the most recent hook start and response per guarded tool call while reading the stream, without changing how those events are otherwise ignored. (source: request)
- `hook_cause` values are `exit_<code>`, `timeout`, `no_response` (start without response) and `not_started` (no hook event for the call). The bounded, secret-redacted stderr excerpt is added when there is one. (source: request)
- Both the protocol failure and its `executor_round_failed` event carry the cause and excerpt. The failure carries them as a suffix of its detail text. The event carries them as the `hook_cause` and `hook_stderr` fields. (source: request)
- When the round is stopped does not change, and rounds where every hook ran get no added event. (source: request)

## Source comparison
- Addressed: Problem. The failure text and the event now name the cause. The existing sentence is kept as the detail's prefix, so consumers matching "hook did not run" are unaffected.
- Addressed: Need 1. Per-call attribution keeps the start's `hook_id` and the response's outcome, exit code and bounded redacted stderr. Hook events are still not counted as ignored; every scenario asserts that no `ignored_events` key starts with `system/hook_`. The request's "whether it timed out" is the response outcome (`timeout`/`cancelled`).
- Addressed: Need 2. `hook_cause` and `hook_stderr` are on the failure and on `executor_round_failed`. The extra values `exit_unknown` and `cancelled`→`timeout` cover response shapes the pinned runtime actually emits.
- Addressed: Need 3 (stop timing unchanged). Both existing stop sites keep their conditions. Existing tests keep running, and the unanswered-at-result scenario exercises the second site.
- Addressed: Need 4 (no event when every hook ran). A normal-run scenario checks the exact event names and field sets recorded on the unchanged tree.
- Addressed: Synthetic acceptance 1–6. These are scenarios 1, 2, 4, 5, 6 and 7 of acceptance.feature. The stderr in 1 is `kogen executor hook: invalid policy` (the real hook's wording), so the excerpt contains "invalid policy". The stored token value is `stored-token-fixture-987654`, set as `Options.Token`.
- Added for completeness: the runtime's `cancelled` timeout shape, an earlier logged call whose hook events must not become a later call's cause (per-call tracking), the unanswered-at-result site, `exit_unknown`, and the 200-byte boundary at 200 and 201 bytes.
- Superseded: the exact detail `hook did not run for the Write call "t1"; the round was stopped` asserted by `TestHooklessCallStillStops` (executor/claudecode/adapter_test.go) gains `; hook_cause not_started`.

## Tests
- Hook starts are attributed to the earliest pending guarded call of the matching tool name, and responses by `hook_id`; hook events of other calls, other tools or other hook events do not become a call's cause: unit tests feeding `roundRun.line` in executor/claudecode, plus the per-call acceptance scenario (unit)
- Cause classification `not_started`, `no_response`, `timeout` (outcome `timeout` and `cancelled`), `exit_<code>` and `exit_unknown` on the tool_result stop: acceptance scenarios through the real adapter with a fake Claude Code (integration)
- Cause on the unanswered-at-result stop: acceptance scenario "An unanswered changed call at the result is named too" (integration)
- Excerpt redaction: stored token in an acceptance scenario; a secret-named environment value in a unit test in executor/claudecode (unit)
- Excerpt trimming and the 200-byte bound at 200 and 201 bytes, and no `hook_stderr` for empty stderr: acceptance scenarios (integration)
- Failure detail suffix format and the `executor_round_failed` `hook_cause`/`hook_stderr` fields, on no other event: acceptance scenarios (integration)
- Rounds where every hook ran keep their event stream: normal-run acceptance scenario (integration)
- Stop conditions and other failures unchanged: existing claudecode tests (`TestLivenessFailure`, `TestRejectedBeforeHookContinues`, `TestDeniedWriteThatRanIsProtocolFailure`, unanswered and Shape hookless tests), with `TestHooklessCallStillStops` updated to the new detail suffix `; hook_cause not_started` (existing)

## Feasibility
- The hook event shapes, `hook_name` construction (`<hook_event>:<tool>`), random `hook_id`, the absence of tool_use_id, and `outcome:"cancelled"` for a timed-out command hook were read from the installed pinned runtime binary `~/.kogen/claude-code/2.1.312/claude`. This was a local inspection, not a retained documentation lookup.
- Probes of the driver on the unchanged tree: the normal-run fixture succeeds with the event names and field sets asserted in the feature. The answered and unanswered failing fixtures both reach today's `executor/protocol` "hook did not run for the Write call \"hook-call\"" stop, without `hook_cause` (legitimate missing-feature red).
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-hook-failure-cause-visible__steps.js"],"observers":["features/steps/k-exec-hook-failure-cause-visible__steps.js"],"checks":[{"name":"good","command":"node features/steps/k-exec-hook-failure-cause-visible__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"node features/steps/k-exec-hook-failure-cause-visible__steps.js bad","exit":1,"output":"observer rejected bad controls\n"}]}
