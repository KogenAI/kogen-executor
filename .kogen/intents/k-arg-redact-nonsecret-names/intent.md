# Preserve nonsecret tool argument names

Slug: k-arg-redact-nonsecret-names
Model: not applicable — deterministic string transformation without meaningful state
Acceptance:
- .kogen/intents/k-arg-redact-nonsecret-names/acceptance.feature
- features/steps/k_tool_args_log.js

Correct Claude Code tool-argument redaction in executor/claudecode/arguments.go so logs preserve operational arguments rather than treating every secret-word substring as a secret holder. Keep the existing run-log format and redaction marker [redacted]. No provider calls or new settings are needed. Reuse the existing synthetic runtime driver in features/steps/k_tool_args_log/main.go unchanged.

## Decisions
- Normalize names case-insensitively, strip leading option dashes and treat hyphens as underscores. A final separated word FILE, PATH, STDIN, LIMIT, COUNT, LENGTH, SIZE, NAME, HELPER, TTL, MAX or MIN exempts a name from secret-name matching. A leading separate NO word also exempts it. Exempt flags must never consume the next positional word for name-based redaction, including --password-stdin and --no-password. (source: request)
- Token-containing longer words and plurals are not secret names for numeric values; tokenizer=cl100k must also remain unchanged as explicitly requested. Match actual secret words rather than treating tokenizer as TOKEN. Keep API_TOKEN, --password, DB_PASSWORD and client-secret secret-named. (source: request)
- Stored-token, environment-value and token-format redaction remain in force and take precedence over name exemptions: a known secret value is still hidden wherever it occurs. Keep the existing minimum environment-value length and all other redaction rules. (source: request)

## Source comparison
- Addressed: request Problem and Need substring false positives and positional swallowing are replaced by the Decisions above, exercised by the unchanged scenario outline and suffix cases in acceptance.feature.
- Addressed: all nine unchanged and four redacted Synthetic acceptance commands are preserved literally in acceptance.feature; the additional --token-limit, plural TOKENS and --no-token cases cover Need examples. All twelve fixed suffix literals are covered there.
- Addressed: Synthetic acceptance rule (b), stored-token and token-format preservation are exercised by separate scenarios with exact output expectations. Existing arguments_test.go redaction cases remain useful and must continue passing.
- Omitted: none of the requested behavior. No scope changes, external protocol changes or secret literals from a real environment are introduced; all secret values here are synthetic.

## Tests
- Nonsecret suffixes and leading NO preserve argument values and positional words: add focused table cases to tool-argument redaction unit tests (unit)
- Tokenizer and numeric token plurals do not hide values: add focused callable redaction cases (unit)
- Reported commands preserve exact run-log arguments while real secret assignments and options redact only values: acceptance outlines through the real adapter and synthetic tool_use runtime (regression)
- Environment values still redact globally despite nonsecret names: acceptance environment scenario and existing environment-value boundary cases (integration)
- Stored-token and token-format redaction are unchanged: acceptance preservation scenarios plus existing redaction tests (regression)

## Feasibility
- none
