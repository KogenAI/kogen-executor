# Claude Code executor environment contract

The Claude Code child environment, for every role and for the `--version` and `auth status` subcommands, removes these inherited variables:

- Credentials and routes: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR`, `CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR`, `ANTHROPIC_PROFILE`.
- Cloud credentials and profile selectors: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_SECURITY_TOKEN`, `AWS_PROFILE`, `AWS_DEFAULT_PROFILE`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE`, `AWS_WEB_IDENTITY_TOKEN_FILE`, `AWS_BEARER_TOKEN_BEDROCK`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_ACCESS_TOKEN`, `ANTHROPIC_FOUNDRY_API_KEY`, `AZURE_CLIENT_SECRET`, `AZURE_CLIENT_CERTIFICATE_PATH`.
- Nested-session variables of a Claude Code that launched Kogen: `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_PID`, `CLAUDE_EFFORT`, `CLAUDE_CODE_EXECPATH`.
- Effort and environment scrub: `CLAUDE_CODE_EFFORT_LEVEL`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`.
- Configuration directory and updates (Kogen sets its own): `CLAUDE_CONFIG_DIR`, `DISABLE_UPDATES`.
- Model selectors: `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_FABLE_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`.
- Request shaping: `ANTHROPIC_CUSTOM_HEADERS`, `CLAUDE_CODE_EXTRA_BODY`, `ANTHROPIC_UNIX_SOCKET`.
- Cloud routes and authentication bypasses: `ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`, `ANTHROPIC_VERTEX_PROJECT_ID`, `ANTHROPIC_FOUNDRY_BASE_URL`, `ANTHROPIC_FOUNDRY_RESOURCE`, `CLAUDE_CODE_SKIP_BEDROCK_AUTH`, `CLAUDE_CODE_SKIP_VERTEX_AUTH`, `CLAUDE_CODE_SKIP_FOUNDRY_AUTH`.
- Git repository, index, object-store and namespace selectors: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`.
- Git configuration overrides: `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_VALUE_<n>` (every variable with either prefix), `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_NOSYSTEM`.
- Claude Code behaviour: `MAX_THINKING_TOKENS`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, `MAX_MCP_OUTPUT_TOKENS`, `BASH_DEFAULT_TIMEOUT_MS`, `BASH_MAX_TIMEOUT_MS`, `BASH_MAX_OUTPUT_LENGTH`, `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`, `DISABLE_PROMPT_CACHING`, `DISABLE_PROMPT_CACHING_HAIKU`, `DISABLE_PROMPT_CACHING_SONNET`, `DISABLE_PROMPT_CACHING_OPUS`, `DISABLE_PROMPT_CACHING_FABLE`.

Kogen's flags and runtime configuration directory determine model and route even without `--model`. Variables that choose no provider, model, repository or behaviour pass through unchanged: `PATH`, `HTTPS_PROXY`, `NO_PROXY`, `AWS_REGION`, `SSL_CERT_FILE`, `LANG`, `GIT_TERMINAL_PROMPT`, `GIT_SSH_COMMAND` and an inherited `GIT_OPTIONAL_LOCKS`. The child receives exactly one runtime `CLAUDE_CONFIG_DIR`, the supplied `HOME` and each managed value: `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `DISABLE_UPDATES=1`; a stored token travels on file descriptor 3 (`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR=3`). A Shape child gets exactly one `GIT_OPTIONAL_LOCKS=0`.

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

### Claude Code round artifact persistence

Each round independently limits redacted payload persisted to `round-N.jsonl` and
`round-N.stderr`. `Options.StreamPersistBytes` and `Options.StderrPersistBytes`
select byte caps; nonpositive values use 64 MiB (67108864) and 8 MiB (8388608)
respectively. These are observation limits, not execution limits. Stream lines
include their appended newline and are kept whole until the first overflow;
subsequent lines are counted but not saved. Stderr keeps its redacted byte prefix
and continues draining. An overflow appends one marker outside the payload cap:

```
{"type":"kogen_persistence_truncated","cap_bytes":4096,"unpersisted_lines":N,"unpersisted_bytes":B}

[kogen: stderr persistence stopped at cap_bytes=4096; unpersisted_bytes=B]
```

The stderr marker includes the leading separator newline. On either terminal
`executor_round_ended` or `executor_round_failed` event, overflow adds
`stream_persist_truncated: true` and `stream_persist_unpersisted_bytes`, or
`stderr_persist_truncated: true` and `stderr_persist_unpersisted_bytes`, for
the affected file only. The stderr fields also count stderr bytes that a failed or
short write to `round-N.stderr` did not persist, and stderr keeps draining after
such a failure. Under the cap and without a failed write these fields and markers
are absent.

A failed or short write to either artifact, including a truncation marker or the
final stderr redactor flush, fails a round that would otherwise succeed with
`executor/failed` rather than emitting `executor_round_ended`. When the round
already fails for another reason (for example a deadline, an interruption, a
protocol error, a usage limit or a missing structured submission), that
failure's reason and detail are kept. The terminal `executor_round_failed` event
has `artifact` (the basename `round-N.jsonl` or `round-N.stderr`) and
`kept_bytes` (the integer count actually written, including any marker bytes)
either way. The `executor/failed` error identifies only that basename and byte
count, not artifact content or the I/O error text. Stderr is drained and the
process group cleaned up before return.
This is not an fsync durability guarantee.
