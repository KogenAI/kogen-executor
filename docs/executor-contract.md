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
final stderr redactor flush, fails the round with `executor/failed` rather than
emitting `executor_round_ended`. The terminal `executor_round_failed` event has
`artifact` (the basename `round-N.jsonl` or `round-N.stderr`) and `kept_bytes`
(the integer count actually written, including any marker bytes). The error
identifies only that basename and byte count, not artifact content or the I/O
error text. Stderr is drained and the process group cleaned up before return.
This is not an fsync durability guarantee.
