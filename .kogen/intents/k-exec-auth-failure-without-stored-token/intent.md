# Classify sign-in refusals without stored tokens

Slug: k-exec-auth-failure-without-stored-token
Model: not applicable — this changes a terminal-result classification predicate and route-specific diagnostic, not session state or transitions
Acceptance:
- .kogen/intents/k-exec-auth-failure-without-stored-token/acceptance.feature
- features/steps/k-exec-auth-failure-without-stored-token__steps.js

Recognize server-refused home-directory sign-ins just as stored-token refusals through the real adapter Start/Round boundary. Startup auth status remains a local-state check: no new network check, login flow, retry or account switching is added. An error result with an authentication_failed assistant signal or the existing authFailedText diagnostic becomes executor/auth_refused regardless of Token. Require is_error for this classification: an assistant authentication warning followed by success remains successful for both routes. Missing results retain protocol/process handling.

## Decisions
- Use the existing stored-token detail unchanged: `Claude Code did not accept the stored token; run `claude setup-token` and `kogen provider login claude-code``. Without a token, name signing in again using `kogen provider login claude-code`, not a stored-token refusal; omit credentials, account identity and the raw 401 body. Wording around the no-token command is not fixed. (source: request)
- Preserve classification of non-authentication outcomes, including overload text merely containing `authenticate`; do not broaden the existing auth text matcher to that word alone. Preserve failed-round emission and usage accounting. (source: request)

## Source comparison
- Addressed: Request Problem and Need 1–2 map to the route-independent error-result classification and route-specific detail above, exercised by paired assistant-plus-401, text-only-401 and assistant-only error cases in acceptance.feature.
- Addressed: Need 3–4 and Synthetic acceptance 3–4 map to successful-result, missing-result, usage-limit, prompt-too-long, overload and provider-unavailable rows for both token routes. The existing authFailedText matching is retained; authentication diagnostics that currently suppress other classification now correctly produce auth_refused on an error result without a token.
- Addressed: Need 5 and Synthetic acceptance 1–5 map to failed event reason/count, subtype, terminal reason, turns and complete usage assertions in the supplied observer, for both routes; usage baseline and partial/absent usage machinery remain unchanged.
- Superseded: the no-token generic-failure expectations in usage_limit_test.go and prompt_size_test.go for actual auth signals must change to auth_refused. The token guard and assistant-warning-over-success refusal in stream.go conflict with the requested success rule and must change. Existing implementation is evidence, not authority over that rule.
- Addressed: exact requested slug, paths, step naming/prefix, documented login and stored-token commands are preserved. No requested outcome is intentionally omitted. Historical unrelated examples in testing policy impose no additional product scope here; its testing and observer requirements are followed.

## Tests
- Server authentication refusal with or without Token: extend TestStoredTokenRejectedByRound and focused fake-Claude coverage for assistant-plus-401, 401-only and assistant-only error results (regression)
- Route-specific safe remediation: verify no-token login command, unchanged token hint and absence of raw 401, credential and account identity (integration)
- Success after an authentication assistant warning and missing-result handling: run both routes through Start/Round in acceptance (regression)
- Preserve usage-limit, context-budget, overload and provider-unavailable precedence for non-auth results: extend existing classification tables and exercise paired route rows in acceptance; update obsolete auth expectations only (integration)
- Failed auth event and usage parity: extend TestFailedAuthRoundReportsUsage to both routes; retain TestFailedRoundOmitsUnreported, TestFailedRoundCostIsDeltaAndKeepsBaseline and TestFailedRoundPreservesCostGapAndBaseline unchanged (integration)

## Feasibility
- evidence: {"id":"auth-observer","kind":"observer","inputs":["features/steps/k-exec-auth-failure-without-stored-token__steps.js"],"observers":["features/steps/k-exec-auth-failure-without-stored-token__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-auth-failure-without-stored-token__steps.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-auth-failure-without-stored-token__steps.js bad","exit":1,"output":"rejected\n"}]}
