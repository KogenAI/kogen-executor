# Cover installed runtime stub sizes

Slug: e-installed-test-stub-size-check
Model: not applicable — this is fixture sizing and regression coverage, with no new lifecycle state
Acceptance:
- .kogen/intents/e-installed-test-stub-size-check/acceptance.feature
- features/steps/e-installed-test-stub-size-check__size.js

Keep executor-owned installed-runtime fixtures compatible with the pinned executable size without weakening production validation. Add the reported short-stub reproductions to the existing size-rule regression test. Preserve existing useful tests and fixture behavior. Do not edit go.mod or go.sum, fetch a real runtime, use paid providers, or change production size validation.

## Decisions
- Work only in kogen-executor; consumer-local cli fixtures, the six consumer test checks and integrate-pins are downstream work, not claims this repository can verify. The local contract probe and executor suite are the executable verification here. (evidence: README.md; contract/fake_claude_test.go) (source: request)
- Preserve the existing sparse padding in both executor-owned installed-runtime fixture helpers; inspect other executor and contract tests for the same unpadded installed-script pattern and fix any additional positive-path fixtures found. Intentional invalid-size fixtures and fixtures using the existing test-origin seam are not positive production-path fixtures. (evidence: executor/claudecode/fake_test.go; contract/fake_claude_test.go; executor/claudecode/runtime_verify_test.go) (source: request)
- Extend the existing TestRuntimeSizeRule with explicit reported short-stub subcases named 507 byte stub and 229 byte stub; keep pinned-size acceptance, adjacent-size rejection and the existing test-origin behavior. Production validation must still return executor/unavailable with actual and expected sizes and the existing removal remedy. (evidence: executor/claudecode/runtime_verify_test.go; executor/claudecode/runtime.go) (source: request)
- The existing pin for darwin/arm64 remains 319598464 bytes; use the platform pin rather than a historical script length to size positive fixtures. Do not introduce a new bypass. (evidence: executor/claudecode/runtime.go; executor/claudecode/fake_test.go) (source: request)
- If a toolchain process is killed again, stop and report the host rather than retrying. (source: request)

## Source comparison
- Addressed: Studio issue 39b9c51e-4272-46ec-80b0-909760ceecab and the 20261107T180001Z / 20261108T000002Z reproductions motivate explicit short-stub coverage in acceptance.feature and the size-rule regression. The reported darwin pin and both historical stub lengths are retained.
- Superseded: the original request's cli/usage_limit_installed_test.go:169 edit and cli-wide search are replaced by the final 8 Nov executor-only ruling. No go.mod/go.sum edits are permitted. Existing local helpers already perform sparse sizing; preserve this instead of manufacturing a production change.
- Omitted from local execution, not claimed fixed: TestUsageLimitResumeInstalledRound2/3, TestUsageLimitPackagingIsolationRound2/3, TestProbeRunsTheInstalledRuntime and the original six-test consumer gate live in kogen, not this checkout. The final ruling's TestUsageLimitResumeInstalled/PackagingIsolation fixture-consumer reference is likewise not a local test name. Their execution and consumer adoption follow integrate-pins. The local counterpart TestProbeRunsInstalledRuntime and full executor suite are exercised instead.
- Addressed: the production short-binary rejection must remain intact, positive-path fixtures must satisfy the pin, no other matching local stub may be left unpadded, and the full local Go suite must pass. Tests and acceptance cover these within executor scope; fixture-pattern audit remains part of implementation and independent review.
- Addressed: the retry note's prior signal-9 failures were historical host faults, not evidence against this fix; its release 6201518 rc-0 report is historical only. A fresh kill is an honest host stop, not permission to retry.

## Tests
- Reported short installed binaries remain rejected: extend TestRuntimeSizeRule with both short-stub reproductions and preserve its error-detail assertions (regression)
- Valid installed scripts pass the pinned size guard: retain existing fixture padding and run the contract installed-runtime probe (integration)
- Other local positive-path stubs satisfy the same guard: inspect matching executor and contract fixture writers and retain their exercising tests (existing)
- The executor remains compatible without dependency changes: run the full Go suite and configured build, vet and formatting checks (existing)

## Feasibility
- TestRuntimeSizeRule runs on the unchanged tree and reports passing pinned-size, adjacent-size and test-origin subcases, but has no explicit reported short-stub subcases. (evidence: ran `go test ./executor/claudecode -run '^TestRuntimeSizeRule$' -count=1 -v`)
