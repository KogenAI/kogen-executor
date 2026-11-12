# Read sign-in and prompt-size text in errors list

Slug: k-exec-auth-and-context-text-in-errors-array
Model: not applicable — the change is a stateless classification of one result object
Acceptance:
- .kogen/intents/k-exec-auth-and-context-text-in-errors-array/acceptance.feature
- features/steps/k-exec-auth-and-context-text-in-errors-array__steps.js

When Claude Code ends a round with an error result, the adapter's sign-in failure check ("Failed to authenticate", "API Error: 401") and over-long-prompt check ("Prompt is too long") currently read only the result's `result` text. They must also read the `errors` list (every string item, ignoring non-string items), in the same way the usage-limit check already does. Classification, exit codes, messages, the token hint and all other behaviour are unchanged; only the searched places grow. A round whose `errors` holds neither text keeps today's classification, a successful round is never reclassified, and the stored token appears in no new message.

## Decisions
- One shared check searches `result` and `errors` for each of the two texts, used at every place that today calls the sign-in or over-long-prompt check on `result` (evidence: executor/claudecode/stream.go) (source: request)
- Non-string items in `errors` are skipped without panic, like the usage-limit check (evidence: executor/claudecode/stream.go) (source: request)
- The over-long-prompt message keeps its existing wording; the quoted text is the first text found in `result` or `errors` (assumption: confirm the message may quote the errors text when result is empty) (source: request)

## Source comparison
- Auth failure text in `errors` only: addressed, auth_refused with the same detail as in `result`.
- Prompt-too-long text in `errors`: addressed, context_budget_exceeded naming prompt size, no clip or retry.
- Same texts in `result`, unrelated `errors`, non-string items: addressed as regression scenarios.

## Tests
- Sign-in failure and over-long prompt in errors classify like in result: scenarios drive a round through the package's fake Claude runtime (scenario)
- Same texts in result and unrelated errors keep today's classification: regression scenarios (regression)

## Feasibility
- none
