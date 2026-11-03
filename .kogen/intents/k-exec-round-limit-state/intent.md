# Retain round rate-limit state in run logs

Slug: k-exec-round-limit-state
Model: .kogen/intents/k-exec-round-limit-state/model.qnt invariants=Valid seed=7 samples=100 steps=30
Acceptance:
- .kogen/intents/k-exec-round-limit-state/acceptance.feature
- features/steps/round_limit_state.js
- features/steps/round_limit_probe_test.go.txt

Retain the last reported rate-limit status and a count of rate_limit_event lines per Claude Code round in executor_round_ended and executor_round_failed. Today dispatch ignores these events; classification uses assistant error rate_limit and result diagnostics. Replace only that loss of telemetry, not classification, error semantics or protocol checks. Production changes belong in executor/claudecode/stream.go and session.go; local adapter tests and fake fixtures may change. Do not change prompts, agent/, runtime.go or contract/claudecode_rounds_test.go.

## Decisions
- Both successful and failed round log records carry the same optional telemetry. Preserve per-round isolation, bounded output and no account fields. (source: request)
- Do not use status (including rejected) to set rateLimited or classify an error. All existing usage_limit, authentication, unfinished-tool and context rules remain unchanged. Do not relax pre-init or post-result checks. (source: request)

Technical wire format: use optional rate_limit_event_count (integer, omitted at zero) and rate_limit_info (object, omitted until a status is reported). No-event records remain byte-identical to existing records. Count rate_limit_event lines accepted by the existing dispatch after init and before result, including bare events. A rate_limit_info object with a nonempty string status replaces the prior snapshot; bare events do not erase it. Retain only status, optional string rateLimitType and optional numeric resetsAt, using their stream names and numeric reset representation unchanged. Missing optional fields in a later snapshot disappear, rather than merging stale data. Bound status and rateLimitType to at most 128 UTF-8 bytes each on rune boundaries (plain prefix truncation). Do not retain utilization, account, credit or payment fields. Unusable telemetry is ignored, never a new protocol error. These technical choices settle the request's unspecified serialization details, not new user settings.

## Source comparison
- Addressed: Request Need and L1 populated/absent examples map to the optional fields above and acceptance scenarios Last report wins, Bare events, and Failure logging. Existing fake_test.go:386 emits a trailing bare event, not a valid in-round report; preserve its existing protocol meaning and add valid populated in-round fixtures instead.
- Addressed: Request per-round last status, limit type, reset instant, count, bounded/no account data maps to Technical wire format and focused adapter tests below. Contract suite rounds without events must stay byte-identical; leave contract/claudecode_rounds_test.go unchanged.
- Addressed: Request independence from K-EXEC-INTERRUPT-CAUSE and K-EXEC-CONFIG-SYMLINK-CHMOD, and no prompts or agent changes, maps to the production boundary above. No ending-reason or runtime configuration changes are authorized.
- Addressed as historical context, not new facts to prove: an earlier research record reported 24 cells/60 allowed events, 25 of 26 completed rounds, zero limit stops and a private-directory coverage gap. This feature makes subsequent telemetry visible in the run log; it neither fills that historical GAP nor diagnoses host load or proves prior plan-limit stops.
- No requested behavior is superseded or deliberately omitted. Technical output names are settled here because the request did not supply them. Documentation retrieved from https://platform.claude.com/docs/en/agent-sdk/typescript (retrieved, untrusted page data) documents rate_limit_info.status and optional numeric resetsAt; its shown type does not list rateLimitType, so the requested optional limit type is retained when supplied rather than invented. Search returned broad Claude sources, not exhaustive schema evidence.

## Tests
- Last report wins, optional fields replace rather than merge, bare lines count, and no account fields survive: populated and bare fixtures through real adapter Round in acceptance and focused stream tests (regression)
- No-event omission and per-round reset preserve old log payloads: two-round acceptance plus existing contract/claudecode_rounds_test.go unchanged (integration)
- Both executor_round_ended and executor_round_failed retain the snapshot/count: success and failed synthetic rounds in acceptance (integration)
- Status does not change error classification, including rejected plus generic api_error versus assistant rate_limit plus api_error: acceptance Examples and existing usage-limit tests (regression)
- Stream protocol checks and what counts as an error remain unchanged: trailing-event acceptance and existing adapter/contract suites (existing)
- Status and limit type are bounded at 128 UTF-8 bytes, optional reset is preserved, and only the three allowed keys are copied: add focused callable stream tests for 127, 128 and 129 bytes and multibyte truncation, plus populated acceptance (unit)

The acceptance helper copies current contract Go fixtures into a temporary package under the module, adds the submitted TestRoundLimitCapture, runs that present test once, and deletes the package. It calls the real Start/Round API against the existing local fake, with no network or model calls. Its LIMIT_CAPTURE output is JSON compared semantically; expected values live in the feature. The model abstracts populated snapshots as last=1 and bare snapshots as unchanged, with nextRound clearing both fields. Full configured format, compile, vet and go-test checks remain required, alongside acceptance. Follow README's go build ./... && go vet ./... && go test -race -count=1 ./... for full verification; do not regenerate unrelated goldens.

## Feasibility
- Quint model typechecked using the configured Kogen Quint command in a scratch probe (exit 0, 0.8 s).
- evidence: {"id":"capture-observer","kind":"observer","inputs":["features/steps/round_limit_state.js","features/steps/round_limit_probe_test.go.txt","contract/fake_claude_test.go"],"observers":["features/steps/round_limit_state.js","features/steps/round_limit_probe_test.go.txt"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/round_limit_state.js good","exit":0,"output":"control accepted\n"},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/round_limit_state.js bad","exit":1,"output":"control rejected\n"}]}
