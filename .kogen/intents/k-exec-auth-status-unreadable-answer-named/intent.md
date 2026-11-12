# Name unreadable sign-in status answers

Slug: k-exec-auth-status-unreadable-answer-named
Model: not applicable — a stateless mapping from one command answer to an error reason and detail
Acceptance:
- .kogen/intents/k-exec-auth-status-unreadable-answer-named/acceptance.feature
- features/steps/k-exec-auth-status-unreadable-answer-named__steps.js

The Claude Code adapter's start check runs `claude auth status --json`. When the command exits successfully but prints something that is not a JSON object (a banner, a changed format, nothing), Start now fails with reason `unavailable` instead of `auth_refused`, so callers do not tell the user to sign in again. The detail says the status answer was unreadable and quotes a short, bounded, token-redacted excerpt of what was printed (or says it was empty). This replaces the old `auth_refused` "did not answer with JSON" result completely.

Unchanged: a failed exit with unreadable output stays `unavailable` with its current detail; every readable answer keeps its current decision (logged out, wrong route, wrong provider, token refused); a JSON object with unknown extra fields is accepted as before.

## Decisions
- The unreadable-answer result uses the existing reason `unavailable`; no new reason is added. (evidence: executor/claudecode/claudecode.go) (source: request)
- "Not a JSON object" means the trimmed output does not parse or does not begin with `{` (so `null`, arrays and strings are also unreadable). (assumption: treating non-object JSON such as `null` as unreadable matches the request's "not a JSON object") (source: request)
- The excerpt is the output with the stored token replaced by the existing redaction mark, trimmed, control characters neutralised by the existing `bound`, cut to 200 bytes and rendered with `strconv.Quote`; an all-whitespace answer is reported as empty. (evidence: executor/claudecode/claudecode.go) (assumption: the request gives no byte limit; 200 bytes is chosen as short, and the whole detail stays under 400 bytes) (source: request)
- Acceptance drives the real Start through a temporary test file placed in `executor/claudecode` that reuses the package's test harness and a shell stand-in `claude`, and removes the file afterwards. (evidence: executor/claudecode/adapter_test.go; executor/claudecode/fake_test.go) (source: request)

## Source comparison
- Synthetic acceptance 1-4 (banner, empty, token plus text, 5000 bytes with exit 0): addressed by the first four scenarios of acceptance.feature.
- Failed exit with unreadable output stays unavailable: addressed by a scenario. `{"loggedIn":false}` with exit 1 stays `auth_refused` sign-in: addressed. Valid claude.ai answer with an extra field starts: addressed.
- Wrong route, wrong provider and token-refused decisions are unchanged code paths and are not re-tested.

## Tests
- Successful exit with a non-JSON-object answer is `unavailable`, names the unreadable answer and quotes the excerpt: scenarios for banner and empty answers (scenario)
- The excerpt redacts the stored token and is bounded: token and 5000-byte scenarios (scenario)
- Failed exit, logged-out answer and extra-field answer keep current behavior: remaining scenarios (scenario)

## Feasibility
- none
