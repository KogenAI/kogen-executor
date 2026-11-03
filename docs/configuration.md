# Claude Code environment configuration

Kogen's flags and runtime Claude Code configuration directory determine the model and route, including when no `--model` flag is passed. Parent environment selectors do not override them. In addition to existing credential, route and nested-session exclusions, Kogen strips:

- Model selectors: `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`.
- Request shaping: `ANTHROPIC_CUSTOM_HEADERS`, `CLAUDE_CODE_EXTRA_BODY`, `ANTHROPIC_UNIX_SOCKET`.
- Cloud routes and authentication bypasses: `ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`, `ANTHROPIC_VERTEX_PROJECT_ID`, `ANTHROPIC_FOUNDRY_BASE_URL`, `ANTHROPIC_FOUNDRY_RESOURCE`, `CLAUDE_CODE_SKIP_BEDROCK_AUTH`, `CLAUDE_CODE_SKIP_VERTEX_AUTH`, `CLAUDE_CODE_SKIP_FOUNDRY_AUTH`.

Transport and region settings `HTTPS_PROXY`, `NO_PROXY` and `AWS_REGION` are retained, as is `PATH`. The child receives Kogen's runtime `CLAUDE_CONFIG_DIR`, the supplied `HOME`, and Kogen's managed environment values instead of inherited overrides. See the [executor environment contract](executor-contract.md).
