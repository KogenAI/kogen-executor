# Pin the ResumeRefused error contract

Slug: core-resume-refused-contract-test
Model: not applicable — the two cases check a stateless helper result
Acceptance:
- .kogen/intents/core-resume-refused-contract-test/acceptance.feature
- features/steps/core-resume-refused-contract-test__steps.js

Close the direct coverage gap (ev-6617af21) in `core/util_test.go`. Call `ResumeRefused(detail string) *sys.Error` directly for a supplied non-empty detail and for the empty string. Check a non-nil result and compare its `Class`, `Reason`, `Detail`, and `Exit` fields in both cases. Nothing is replaced or removed: keep the existing utility tests, resume behavior, and system error type unchanged. The only implementation edit is to `core/util_test.go`.

Original request:
> Evidence: ev-6617af21 In core/util.go, ResumeRefused converts a detail string into a candidate-class resume_refused system error with exit code 1. No test in core/util_test.go directly exercises this exported error helper.
>
> Expected: Add a direct test that pins the class, reason, detail, and exit code produced by ResumeRefused.
>
> Scope: core/util_test.go. Out of scope: changing resume behavior or the system error type.
>
> Acceptance:
> 1. A supplied detail is preserved on the returned error, with class candidate, reason resume_refused, and exit code 1. Wrong-implementation: checking only the reason would miss a changed class, lost detail, or incorrect exit code.
> 2. An empty detail remains empty while the same error classification and exit code are returned. Wrong-implementation: replacing an empty detail with invented explanatory text would fail this check.

## Decisions
- Treat this as a test-only change: add direct assertions to core/util_test.go for supplied and empty detail, without modifying ResumeRefused or the system error type. (evidence: core/util.go; core/util_test.go) (source: request)
- Verify test effectiveness by comparing unchanged and independently mutated helper results using scratch copies of the utility files, without filtering on a new test name. (evidence: core/util.go; core/util_test.go; features/steps/core-nonnil-slice-tests__steps.js) (source: request)

## Source comparison
- Addressed: the request's evidence ev-6617af21 matches `core/util.go`'s current `ResumeRefused` result and the absence of a direct call in `core/util_test.go`. The outcome and both Tests lines add coverage, not a new error or resume behavior.
- Addressed: acceptance 1 maps to “Supplied detail is preserved with the refusal classification” in `acceptance.feature`. It requires `candidate`, `resume_refused`, unchanged supplied detail, and `1`. Independent non-empty-only scratch changes to class, reason, detail, and exit code must be rejected; the reason-only Feasibility fixture and the omitted-assertion wrong controls exercise the requested counterexample.
- Addressed: acceptance 2 maps to “Empty detail remains empty with the same refusal classification.” Independent empty-only scratch changes check the same classification and exit value, including a mutation that invents explanatory text for an empty input. The empty-detail wrong control omits just that comparison and must fail the scenario.
- Addressed: implementation scope and exclusions are carried in the outcome and Decisions. The controls and steps exercise copies only; nothing is omitted, conflicting, or superseded.

## Tests
- A supplied detail is preserved exactly along with the required refusal classification and exit code: add a direct non-empty case in `core/util_test.go` comparing all four returned fields (unit)
- Empty detail stays empty with the same classification and exit code: add a direct empty case in `core/util_test.go` comparing all four returned fields (unit)

## Feasibility
- Inspected the pinned `sys.Error` declaration with `go doc github.com/KogenAI/kogen-loop/sys.Error`: the string fields are `Class`, `Reason`, and `Detail`; the integer field is `Exit`, not a shell exit status. Go 1.27.2 ran the existing named `TestHashHexKnownVectors` with `run` and `pass` events (probe: exit 0).
- In unchanged scratch utility copies, `GOFLAGS=-trimpath go test -json -count=1 <scratch>/util.go <scratch>/util_test.go` completed successfully. Output included `{"Action":"run","Package":"command-line-arguments","Test":"TestDisplayFloatInterpolation"}` and `{"Action":"pass","Package":"command-line-arguments"}`, shown without timing fields (probe: exit 0). Acceptance uses this file pair, the pinned Go toolchain and module dependencies (`go.mod`), and the configured Kogen-provided Node/Cucumber runner (`.kogen/project.yaml`). Each oracle run must execute tests and pass with the unchanged helper; each mutation must finish with a failing test assertion emitted from `util_test.go`, not a build failure or timeout. Before delivery, use the configured format, compile, vet, go-test and acceptance checks.
- evidence: {"id":"supplied-observer","kind":"observer","inputs":["core/util.go",".kogen/intents/core-resume-refused-contract-test/good.go.txt",".kogen/intents/core-resume-refused-contract-test/bad.go.txt"],"observers":["features/steps/core-resume-refused-contract-test__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/core-resume-refused-contract-test__steps.js supplied candidate resume_refused 1 .kogen/intents/core-resume-refused-contract-test/good.go.txt","exit":0,"output":"verified\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/core-resume-refused-contract-test__steps.js supplied candidate resume_refused 1 .kogen/intents/core-resume-refused-contract-test/bad.go.txt","exit":1,"output":"supplied detail: wrong class survived the utility tests\n"}]}
- evidence: {"id":"empty-observer","kind":"observer","inputs":["core/util.go",".kogen/intents/core-resume-refused-contract-test/good.go.txt",".kogen/intents/core-resume-refused-contract-test/bad.go.txt"],"observers":["features/steps/core-resume-refused-contract-test__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/core-resume-refused-contract-test__steps.js empty candidate resume_refused 1 .kogen/intents/core-resume-refused-contract-test/good.go.txt","exit":0,"output":"verified\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/core-resume-refused-contract-test__steps.js empty candidate resume_refused 1 .kogen/intents/core-resume-refused-contract-test/bad.go.txt","exit":1,"output":"empty detail: invented empty detail survived the utility tests\n"}]}
- Generated controls.json from the unchanged utility test and the good fixture; the overlays affect only `core/util_test.go` (probe: exit 0).
