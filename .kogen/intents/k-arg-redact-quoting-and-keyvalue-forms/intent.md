# Extend tool argument secret redaction

Slug: k-arg-redact-quoting-and-keyvalue-forms
Model: not applicable — deterministic string transformation without meaningful state
Acceptance:
- .kogen/intents/k-arg-redact-quoting-and-keyvalue-forms/acceptance.feature
- features/steps/k_tool_args_log.js

Extend secret-named value redaction in executor_tool argument strings through the real Claude Code adapter. Keep [redacted] and NAME-stays/VALUE-goes. Replace the current incomplete matching of colon pairs, headers, basic-auth passwords and special shell quoting. Do not change defined token formats, argument bounds, event schemas, runtime execution or other adapter behavior. No live provider calls are needed. Reuse the existing fake runtime driver in features/steps/k_tool_args_log/main.go and existing step bindings unchanged.

## Decisions
- Preserve names, surrounding punctuation and unrelated text in JSON/YAML pairs, including pairs embedded in shell strings; preserve ordinary quoted pair delimiters. Support single and double quoted names/values and unquoted YAML values. (source: request)
- Redact whole secret-named HTTP header values, including Cookie and Set-Cookie. Header names containing KEY, TOKEN, SECRET or AUTH are secret-named, case-insensitively; retain existing secret-name recognition elsewhere. (source: request)
- For -u and --user user:password arguments preserve the username and colon and redact the entire password. (source: request)
- Consume the complete ANSI-C $'...' or backslash-escaped quote value, including its closing delimiter, when replacing a secret-named assignment/option value; do not leave any value fragment or orphan closing quote. (source: request)
- Keep existing redaction coverage and leave non-secret text unchanged. Existing Authorization Bearer redaction must remain effective; whole-value header replacement is permitted by the new whole-header rule. (source: request)

## Source comparison
- Addressed request Need 1 and synthetic cases 1/4: acceptance pair examples preserve user ana, JSON punctuation and cfg.yml redirection, and add single-quoted and unquoted pair forms.
- Addressed Need 2 and cases 2/6: acceptance covers X-Api-Key, KEY/TOKEN/SECRET/AUTH names and whole Cookie/Set-Cookie values, retaining names and URLs.
- Addressed Need 3 and case 3: acceptance covers both -u and --user with admin retained.
- Addressed Need 4 and case 5: acceptance preserves exact escaped-quote and ANSI-C reproductions and requires no remaining quote delimiter.
- Addressed controls case 7 and preservation requirement: exact unchanged control strings and existing redaction regression tests remain required. Defined token formats are explicitly unchanged. No requested scope is omitted. Existing scheme-only Authorization output is superseded only where the new whole-header rule requires it; previously secret data must never reappear.

## Tests
- JSON/YAML secret-named pairs preserve names, punctuation and non-secret values: add focused cases to TestToolArgumentsRedactionRules and run fake-runtime pair scenarios (regression)
- Secret-named headers and Cookie/Set-Cookie replace whole values: add focused transformation cases and run fake-runtime header scenarios (regression)
- Basic-auth options preserve users but remove passwords: add focused transformation cases and run fake-runtime auth scenarios (regression)
- Special quote forms consume the whole secret value: add focused transformation cases and run exact fake-runtime reproductions (regression)
- Non-secret strings stay verbatim: exact fake-runtime control scenarios (regression)
- Existing secrets, token formats, bounds and tool-event behavior remain covered: retain existing arguments tests and run configured project checks (existing)

## Feasibility
- none
