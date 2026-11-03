# Profile Claude Code round streams in round events

Slug: k-exec-stream-profile
Model: not applicable — per-round timestamps and a bounded counter map. Nothing in this state changes a transition, a stop or a claim. They are only reported in the round's single terminal event.
Acceptance:
- .kogen/intents/k-exec-stream-profile/acceptance.feature
- features/steps/stream_profile.js
- features/steps/stream_profile_capture_test.go.txt

Today a Claude Code round's stream is reduced to init, tool, rate-limit and result handling. `executor_round_ended` and `executor_round_failed` say nothing about timing. Any stream line the adapter does not interpret (any `system` subtype other than init or hook startup, any other `type`) is dropped without a trace. A slow round cannot be split into startup, model wait and tool time. A stream carrying Claude Code retry or status notices looks the same as one without them.

This change adds four observability fields to both terminal round events of the Claude Code adapter (`executor/claudecode`). The fields are a round wall time, the time from process start to the init event, the longest gap between consecutive stream lines, and a bounded map of ignored `type/subtype` keys to counts. It is observation only. There is no new stop behaviour and no idle kill or timeout. The deadline, the KillGrace ladder, the protocol checks (pre-init, post-result, malformed lines), error reasons and details, endings, claims, structured output, usage, rate-limit telemetry and the tool/hook events all stay unchanged. Every existing key of the two events keeps its value; the new keys are only added. No line becomes newly accepted or newly rejected.

Production changes belong in `executor/claudecode/stream.go` and `executor/claudecode/session.go`. Focused tests go in `executor/claudecode`. Do not change prompts, `agent/`, `runtime.go`, the goldens or `contract/`; no consumer uses the new fields yet.

Technical wire format. These names and details are settled here because the request did not supply them:

- `wall_ms` (integer, always present on both events): whole milliseconds, truncated, from the moment Round creates the round's run state (right after `executor_round_started` is emitted) to the building of the terminal event. It is present even when the process never started, for example a context that is already done.
- `init_ms` (integer, present only when the round's `system/init` line passed the existing init gate): whole milliseconds from the moment the Claude Code process was started (right after the process start succeeds) to the receipt of that init line. It is omitted when no init line came, when the init gate rejected it, or when the process never started.
- `max_line_gap_ms` (integer, always present): the longest interval, in whole milliseconds, between the receipt of two consecutive stdout lines of this round. Receipt is when the round loop takes a line from the reader, before redaction and parsing. Every line counts, including startup events, ignored lines and a line that then fails the round. It is 0 with fewer than two lines. The wait before the first line, and the time after the last one, are not gaps.
- `ignored_events` (JSON object of key -> integer count, omitted when no line was ignored) counts the lines that the existing dispatch accepts, after init and before the result, and does not interpret:
  - any `type` other than `system`, `assistant`, `user`, `rate_limit_event` and `result`;
  - type `system` with a subtype other than `init`, `hook_started`, `hook_response` and `plugin_install`. These four are never counted, before or after init.
- Ignored-event keys:
  - The key is the line's `type` string, plus `/` and the `subtype` when `subtype` is a nonempty string. A missing or non-string type counts as the empty type.
  - Keys are built from the already redacted line.
  - A key is cut to at most 64 bytes on a UTF-8 rune boundary, as a plain prefix with no marker. Lines whose cut keys are equal share one count.
  - The map keeps at most 16 keys: the first 16 distinct keys in arrival order. A line with a further new key is not counted and does not fail the round. Lines with keys already in the map keep counting.
- Lines rejected by the existing protocol checks are not counted as ignored. This covers a non-startup first event, events after the result and malformed JSON.

## Decisions
- `executor_round_ended` and `executor_round_failed` both add the profile fields: round wall ms, ms from process start to the init event, the longest gap between consecutive stream lines in ms, and the ignored `type/subtype` -> count map, bounded to 16 keys with truncated keys. (source: request)
- No new stop behaviour, no idle kill, and no change to what is read as a claim. A stream with ignored lines has the same round outcome as one without them. (source: request)
- A stream with no init still reports wall time and line gap on its failed event, without the init-time field. (source: request)

## Source comparison
- Addressed: Problem and Need (wall ms, process start to init, longest gap, ignored `type/subtype` map, bounded to 16 keys with truncated keys, on both events) map to the Technical wire format and to the scenarios.
- Addressed: the request evidence matches the current code at this revision. In `stream.go:50-105`, `line` handles `system` only for init and has no default, so other types are dropped. The ended event at `stream.go:417-421` has no timing. `session.go` emits `executor_round_started` (now line 102) and builds `executor_round_failed` at lines 111-116. Those are the two terminal emission points to extend.
- Addressed: Synthetic acceptance 1 (lines at 0 s, 1 s, 6 s, 7 s with the result; gap 5 s within tolerance; wall >= 7 s) is round "gaps": init at 0, assistant lines after sleeps of 1 and 5 s, and the result after 1 s more. The expected gap is 4900-6000 ms and wall_ms is at least 7000.
- Addressed: Synthetic acceptance 2 (two `system/other_notice` lines and one unknown `type`; counts 2 and 1 by key; same outcome) is round "notices", compared with "plain". A post-init `system/hook_started` line in that stream is not counted.
- Addressed: Synthetic acceptance 3 (40 distinct unknown subtypes, at most 16 keys, no failure) is round "forty", which keeps the first 16 keys. Key truncation is round "long keys": 64 ASCII bytes, a shared cut key counted twice, and a cut on a multibyte boundary at 63 bytes.
- Addressed: Synthetic acceptance 4 (no init: the failed event carries wall and gap, with no init field) is round "no init": hook startup lines 2 s apart, then exit 0. The result is the existing protocol failure, with gap 1900-4000 ms and no `init_ms`. Added to cover the Need for both events: "dies after init" (exit 3 without a result) carries `init_ms`, gap and `ignored_events` on `executor_round_failed`. "late init" proves that `init_ms` is measured from process start and that the wait before the first line is not a line gap.
- Addressed: "Fake `claude` with a controllable clock/sleeps" is a generated POSIX shell fake installed at `claudecode.RuntimePath(home)`, with real `sleep` calls between scripted lines, driven through the public `claudecode.New`/`Start`/`Round` API.
- Omitted: no consumer (kogen, kogen-build) changes, no contract-suite pins and no README change. The request asks only for the events.

## Tests
- The longest gap between consecutive lines and the round wall time are reported (0/1/6/7 s stream, gap about 5 s, wall >= 7 s): acceptance round "gaps" through the real Round with the sleeping fake (integration)
- The init time is measured from process start, and the wait before the first line is not a gap: acceptance round "late init" (integration)
- Uninterpreted lines are counted by `type/subtype` or `type`; hook startup subtypes are excluded; the map is omitted when empty; the outcome is unchanged: acceptance rounds "notices" and "plain" (integration)
- The map keeps the first 16 keys, cuts keys to 64 bytes on a UTF-8 boundary, merges equal cut keys and never fails the round: acceptance rounds "forty" and "long keys", plus a focused test in `executor/claudecode` that feeds lines to a round's line handling. That test checks the 64-byte boundary (63/64/65-byte keys and a multibyte cut) and the 16th versus 17th distinct key (unit)
- The failed event carries wall and gap without `init_ms` when no init came, and the full profile after init: acceptance rounds "no init" and "dies after init" (integration)
- No change to stopping, protocol checks, error classification, claims or existing event keys: the existing adapter, conformance and contract suites pass unchanged (existing)

The acceptance helper copies the submitted `TestStreamProfileCapture` into a temporary package under the module and runs it once with `go test -count=1 -v -run ^TestStreamProfileCapture$`. It deletes the package afterwards. The test calls the real Start/Round API against a generated shell fake with real sleeps, with no network and no model calls. Its JSON capture is compared semantically, and the expected values live in the feature. The full configured format, compile, vet and go-test checks remain required.

## Feasibility
- A scratch copy of this revision with the submitted step files was used. On the unchanged tree all 7 scenarios fail only at the first new-field assertion, and every outcome step already passes: ended/finish, protocol and failed. A throwaway sketch of the described fields in stream.go/session.go made all 7 scenarios pass (97 steps, 17 s), so the timing bounds and fixtures are satisfiable. The sketch was discarded.
- evidence: {"id":"stream-profile-observer","kind":"observer","inputs":["features/steps/stream_profile.js","features/steps/stream_profile_capture_test.go.txt"],"observers":["features/steps/stream_profile.js","features/steps/stream_profile_capture_test.go.txt"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/stream_profile.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/stream_profile.js bad","exit":1,"output":"observer rejected mutations\n"}]}
