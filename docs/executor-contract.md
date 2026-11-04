# Claude Code executor environment contract

The Claude Code child environment removes inherited credentials, route and nested-session exclusions, as well as these selectors:

- Model selectors: `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`.
- Request shaping: `ANTHROPIC_CUSTOM_HEADERS`, `CLAUDE_CODE_EXTRA_BODY`, `ANTHROPIC_UNIX_SOCKET`.
- Cloud routes and authentication bypasses: `ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`, `ANTHROPIC_VERTEX_PROJECT_ID`, `ANTHROPIC_FOUNDRY_BASE_URL`, `ANTHROPIC_FOUNDRY_RESOURCE`, `CLAUDE_CODE_SKIP_BEDROCK_AUTH`, `CLAUDE_CODE_SKIP_VERTEX_AUTH`, `CLAUDE_CODE_SKIP_FOUNDRY_AUTH`.

Kogen's flags and runtime configuration directory determine model and route even without `--model`. The child retains `HTTPS_PROXY`, `NO_PROXY`, `AWS_REGION` and `PATH`; proxy and region settings are not route selectors stripped by this policy. It receives exactly one runtime `CLAUDE_CONFIG_DIR`, supplied `HOME`, and each managed value: `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, and `DISABLE_UPDATES=1`.

## Provider failures

An error result reporting Claude Code provider overload or temporary unavailability is
`executor/provider_unavailable`, distinct from startup `executor/unavailable`. Its
bounded, redacted detail identifies the provider diagnostic and is also reported in
`executor_round_failed`. The session remains failed, cannot continue, and offers no
exact resume; the adapter does not retry or switch routes.

## Round usage

`Usage` reports nullable token counts as `input`, `cached`, `cache_write`,
`output`, and `reasoning`; unreported counts are JSON null, including
`cache_write`. Cache writes are optional and are not required for complete usage
from every executor. Claude Code maps `cached` to cache reads and `cache_write`
to cache creation independently. Its `input` is the sum of fresh input, cache
reads and cache creation only when all three are reported. A creation-only
report is partial; no reported counts means unknown. An explicit zero remains
zero. Successful and failed terminal events include these counts when they
include usage. Cost remains the harness estimate, not a bill.
