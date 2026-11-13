# Strip Claude behaviour vars from child env

Slug: k-exec-child-env-behavior-shaping-vars-stripped
Model: not applicable — deterministic environment filtering has no meaningful state
Acceptance:
- .kogen/intents/k-exec-child-env-behavior-shaping-vars-stripped/acceptance.feature
- features/steps/k-exec-child-env-behavior-shaping-vars-stripped__steps.js

The Claude Code child environment, for every role, removes the behaviour variables `MAX_THINKING_TOKENS`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, `MAX_MCP_OUTPUT_TOKENS`, `BASH_DEFAULT_TIMEOUT_MS`, `BASH_MAX_TIMEOUT_MS`, `BASH_MAX_OUTPUT_LENGTH`, `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`, `DISABLE_PROMPT_CACHING`, `DISABLE_PROMPT_CACHING_HAIKU`, `DISABLE_PROMPT_CACHING_SONNET`, `DISABLE_PROMPT_CACHING_OPUS` and `DISABLE_PROMPT_CACHING_FABLE` in the same strip step as the existing list. `HTTPS_PROXY`, `NO_PROXY`, `SSL_CERT_FILE`, `LANG` and `PATH` pass through. `docs/configuration.md` and `docs/executor-contract.md` name the stripped variables.

The repository at HEAD already implements this (stripEnv in executor/claudecode/args.go and both documents). This Intent pins the requested behaviour under its own acceptance; the Build needs no further production change and must not alter existing behaviour.

## Decisions
- Reuse the existing stripEnv list; add no setting or option. (evidence: executor/claudecode/args.go; docs/configuration.md; docs/executor-contract.md) (source: request)

## Source comparison
- addressed: Need's stripped names, passthrough variables and documentation lists map to scenarios 1 and 3.
- addressed: Synthetic acceptance's childEnv base and fake-claude round map to scenarios 1 and 2.

## Tests
- Behaviour variables are removed, five passthrough variables and singleton overrides stay: childEnv capture test (unit)
- A round never shows parent MAX_THINKING_TOKENS=1 or BASH_DEFAULT_TIMEOUT_MS=1 to claude: fake-claude round (integration)
- Both documents name every stripped behaviour variable: documentation check (existing)

## Feasibility
- none
