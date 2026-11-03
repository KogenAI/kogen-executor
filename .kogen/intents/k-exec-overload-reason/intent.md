# Distinguish transient provider failures

Slug: k-exec-overload-reason
Model: not applicable — error classification changes, not the existing failed-session lifecycle; continuation remains forbidden and resume remains none
Acceptance:
- .kogen/intents/k-exec-overload-reason/acceptance.feature
- features/steps/overload_reason.js
- features/steps/overload_capture_test.go.txt

Classify Claude Code provider overload/temporary unavailability separately from executor defects. Add public executor.ReasonProviderUnavailable with wire value `provider_unavailable` and document it in docs/executor-contract.md. Do not reuse startup `unavailable`. No retries, fallback routes, waits, or exact resume are added.

Only an error result qualifies: assistant error kind `overloaded`, result/errors text with `overloaded_error` or the explicit overloaded diagnostic, or API-error text carrying a standalone HTTP 500–599 status (including 503 and 529). Match status diagnostics rather than arbitrary embedded numbers. Preserve existing protocol/process/hook faults, authentication exclusions and precedence, usage_limit, and candidate/context_budget_exceeded classifications. Authentication with a stored token remains auth_refused; without one preserve its existing classification. Success text containing overloaded is not an error. Malformed streams remain protocol even if they also contain provider trouble.

The returned executor/provider_unavailable detail must name the actual provider diagnostic (assistant kind when that is the only wording), preserve a bounded excerpt and use existing redaction. Cap complete detail at 1024 UTF-8 bytes; never copy an unbounded provider response. executor_round_failed must carry the identical reason and detail. The failed session must still refuse a following Round with the existing cannot-continue detail and advertise ResumeNone.

Replace overloaded=>failed in TestUsageLimitOtherErrors and the overloaded text expectation in prompt_size_test.go; keep useful unrelated tests. Update intended paired contract assertions if necessary, not unrelated consumer behavior.

## Decisions
- Provider failures are distinct and documented, but leave the session failed with no exact resume. (source: request)
- Authentication, usage limits, context limits, protocol faults and ordinary successes keep their current classifications. (source: request)

## Source comparison
- Addressed: request Problem/Need by the public reason, bounded diagnostic and failed-round event above. `provider_unavailable` and 1024 bytes settle the unspecified reason spelling and bound technically.
- Addressed: synthetic acceptance (1) assistant overloaded/api_error, event and following Round refusal; (2) 529 and 503 text; (3) usage_limit, auth_refused, context_budget_exceeded and generic failed; (4) overloaded in successful text. All appear in acceptance.feature, alongside overloaded_error and auth-with-overloaded counterexamples.
- Superseded: usage_limit_test.go TestUsageLimitOtherErrors overloaded=>executor/failed and prompt_size_test.go overloaded text=>executor/failed are replaced by provider_unavailable. Other results retain their reasons.
- Addressed: Need bounded provider wording, unchanged protocol class, no exact resume and documentation via diagnostic/event assertions, malformed-stream case, ResumeNone assertion and required executor contract documentation. No requested behavior is deliberately omitted.

## Tests
- Assistant overloaded with api_error and textual 5xx/529/overloaded_error diagnostics classify distinctly: fake executable Round table and acceptance (regression)
- Failed-round events carry the same reason and bounded provider wording: adapter capture plus implementation long-diagnostic regression (integration)
- A failed Round prevents continuation and has no exact resume: subsequent Round and handle capture (integration)
- Authentication, usage limits, prompt-too-long, generic errors and protocol faults preserve classifications: fake executable counterexample table (regression)
- Successful overloaded text remains a normal finish: fake executable success case (regression)
- Public reason and semantics are documented: review docs/executor-contract.md alongside executor reason constant (existing)

## Feasibility
- Authoritative API error source discovered by documentation search: https://platform.claude.com/docs/en/api/errors; fetch returned retrieved, untrusted truncated HTML, not usable protocol proof. Synthetic inputs use the repository fake and requested reproductions; no live-provider support is claimed.
- evidence: {"id":"overload-observer","kind":"observer","inputs":["features/steps/overload_capture_test.go.txt","features/steps/overload_reason.js"],"observers":["features/steps/overload_reason.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/overload_reason.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/overload_reason.js bad","exit":1,"output":"observer rejected\n"}]}
