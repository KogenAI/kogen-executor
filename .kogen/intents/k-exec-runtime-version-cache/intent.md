# Invalidate replaced runtime version observations

Slug: k-exec-runtime-version-cache
Model: .kogen/intents/k-exec-runtime-version-cache/model.qnt invariants=Safe seed=1 samples=100 steps=20
Acceptance:
- .kogen/intents/k-exec-runtime-version-cache/acceptance.feature
- features/steps/runtime_cache.js
- features/steps/runtime_cache_driver/main.go

Bind version observations to the managed executable rather than the adapter lifetime. A successful Describe must not let a later Start run an unsupported replacement. Refresh observations after both rename replacement and in-place rewrite; missing or unreadable executables must not retain a previous successful answer. Describe remains non-failing and uses `claude-code unknown` when unreadable. Start rejects an unsupported version with ReasonUnavailable, reporting the replacement's answer before authentication, executor_started, or task execution.

Use executable identity/content freshness, not path alone. Preserve reuse of an unchanged supported runtime (the same adapter remains usable; do not require a new adapter). No new options, version overrides, provider calls, or runtime pin changes. Keep existing installer behavior for a missing runtime at Start; the missing-file acceptance deliberately observes Describe without invoking the installer. This is not a guarantee against adversarial concurrent executable mutation between OS operations, nor a new session-round revalidation feature.

## Decisions
- Use two local executable scripts reporting `2.1.312 (Claude Code)` and `0.0.0 (Claude Code)` at the same managed path; no provider requests. (source: request)
- Unsupported replacement is refused before authentication or a task round, and cannot be described as the earlier supported version. (source: request)
- Preserve normal supported reuse, isolation, cancellation, and deliberate pinning at Version = `2.1.312`. (source: request)

## Source comparison
- Addressed: request Problem and Need by replacing adapter-lifetime caching in executor/claudecode/claudecode.go with executable-bound observations; prose above and replacement scenarios cover stale Describe and Start validation.
- Addressed: Synthetic acceptance rename, rewrite, unchanged, missing and cancellation cases are all in acceptance.feature, using the same adapter and local scripts in runtime_cache_driver/main.go. Missing is checked through Describe, preserving runtime.go's existing Start installer rather than introducing an unrelated missing-file refusal.
- Addressed: README testing and isolation conventions remain in force; full configured checks and existing preflight cancellation/process tests must remain passing. No public API or runtime pin changes are requested.
- Omitted: no requested behavior is deliberately dropped. The acceptance does not initiate a task round after a refused Start because no session may be returned; absence of authentication, session and start events establishes the pre-execution boundary.

## Tests
- Rename and rewrite invalidate a populated version observation and refuse unsupported Start before auth or execution: replacement outline with version, diagnostic, session, event and invocation observations (regression)
- Unchanged supported executable remains reusable on the same adapter: unchanged scenario starts a real local session (integration)
- Missing executable cannot report a previously successful version: missing scenario through Describe (integration)
- Cancellation must prevent authentication and session start even with populated validation: cancel scenario plus existing cancellation/process-group tests (regression)
- Preserve deliberate pinning, installation and isolated child environment: existing runtime, adapter, token transport and preflight process suites remain passing (existing)

## Feasibility
- Local Quint typecheck and 20-sample 10-step run succeeded with Safe; model abstracts replacement, validation and cancellation, not filesystem identity mechanics. (probe 1: exit 0, 0.9 s)
- evidence: {"id":"runtime-observer","kind":"observer","inputs":["features/steps/runtime_cache_driver/main.go","features/steps/runtime_cache.js"],"observers":["features/steps/runtime_cache.js","features/steps/runtime_cache_driver/main.go"],"checks":[{"name":"good","command":"go run ./features/steps/runtime_cache_driver unchanged | \"$KOGEN_NODE\" features/steps/runtime_cache.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"go run ./features/steps/runtime_cache_driver unchanged | \"$KOGEN_NODE\" features/steps/runtime_cache.js bad","exit":1,"output":"rejected\n"}]}
