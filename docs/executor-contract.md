# Claude Code executor environment contract

The Claude Code child environment removes inherited credentials, route and nested-session exclusions, as well as these selectors:

- Model selectors: `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`.
- Request shaping: `ANTHROPIC_CUSTOM_HEADERS`, `CLAUDE_CODE_EXTRA_BODY`, `ANTHROPIC_UNIX_SOCKET`.
- Cloud routes and authentication bypasses: `ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`, `ANTHROPIC_VERTEX_PROJECT_ID`, `ANTHROPIC_FOUNDRY_BASE_URL`, `ANTHROPIC_FOUNDRY_RESOURCE`, `CLAUDE_CODE_SKIP_BEDROCK_AUTH`, `CLAUDE_CODE_SKIP_VERTEX_AUTH`, `CLAUDE_CODE_SKIP_FOUNDRY_AUTH`.

Kogen's flags and runtime configuration directory determine model and route even without `--model`. The child retains `HTTPS_PROXY`, `NO_PROXY`, `AWS_REGION` and `PATH`; proxy and region settings are not route selectors stripped by this policy. It receives exactly one runtime `CLAUDE_CONFIG_DIR`, supplied `HOME`, and each managed value: `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, and `DISABLE_UPDATES=1`.
