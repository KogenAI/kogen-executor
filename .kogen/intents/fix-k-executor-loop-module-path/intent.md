# Check loop imports in generated-test templates

Slug: fix-k-executor-loop-module-path
Model: not applicable — a one-line change to a grep's file filter in a landed acceptance scenario; no state
Acceptance:
- .kogen/intents/fix-k-executor-loop-module-path/acceptance.feature
- features/steps/fix-k-executor-loop-module-path__steps.js

This fixes an automated review finding (P2) on the landed k-executor-loop-module-path change. Scenario 2 of `.kogen/intents/k-executor-loop-module-path/acceptance.feature`, "Remove bare imports from repository and actual build dependencies", is supposed to guard that no repository source keeps a bare `kogen-loop/` import. That Intent explicitly covers the generated-test source templates `features/steps/*.go.txt`. But the scenario's grep only matches `--include=*.go`, so it never reads those templates. Its second check, `go list -deps -test ./...`, does not see them either, because they are not Go packages. So if a template goes back to a bare `kogen-loop/` import, acceptance stays green.

**Reproduced on current main (34f4718)** in a scratch copy outside the checkout. Today every `.go.txt` template that imports the loop uses the canonical `github.com/KogenAI/kogen-loop/sys` (overload_capture, interrupt_capture, round_limit_probe and stream_profile_capture `_test.go.txt`). In `features/steps/overload_capture_test.go.txt`, `"github.com/KogenAI/kogen-loop/sys"` was replaced with `"kogen-loop/sys"`. The landed grep still found nothing (exit 1), and the landed scenario, run alone through Cucumber with its own step file, still PASSED. So the stated requirement is no longer asserted for templates, and the fix goes ahead.

**The change.** In `.kogen/intents/k-executor-loop-module-path/acceptance.feature`, scenario 2, change the grep line
`      grep -rn "\"kogen-loop/" --include=*.go .`
to
`      grep -rn "\"kogen-loop/" --include=*.go --include=*.go.txt .`
Keep the existing `--include=*.go` so that Go sources stay covered, including build-ignored ones that `go list` does not see. Change nothing else: not the rest of that scenario, not its other scenarios, not its intent.md, not features/steps/k-executor-loop-module-path__steps.js, and no Go source or template. On the unchanged main tree the widened grep finds nothing (exit 1), so the landed scenario still passes there.

## Decisions
- First show the finding on current main, and stop only if it does not reproduce. It does reproduce: a bare import in a `.go.txt` template leaves the landed scenario green. (source: request)
- The fix is to add `--include=*.go.txt` to scenario 2's grep, and keep `--include=*.go` next to it. (source: request)
- Keep every existing test green, and make no unrelated changes. (source: request)

## Source comparison
- Addressed: Problem "`features/steps/*.go.txt` templates are not matched, so a regression to a bare `kogen-loop/` import there passes acceptance". Where: "scenario 2 grep `--include=*.go`". Covered by acceptance scenario "A bare loop import in a generated-test template fails the landed import check". On current main it is red: the landed scenario reports PASSED.
- Addressed: Need "First show it … on current main". The scratch reproduction is described above. The same acceptance scenario is that demonstration in executable form.
- Addressed: Need "fix it so the test fails on the broken behaviour and passes on main: Add `--include=*.go.txt`". The broken template must make the landed scenario FAIL (scenario 2). The unchanged tree must make it PASS (scenario 1).
- Addressed: Need "Keep every existing test green; no unrelated changes". Scenario 3 guards that the Go-source coverage is not lost: a build-ignored Go file with a bare import must still fail the landed scenario. That file is visible only to the `--include=*.go` part of the grep. This rejects a fix that replaces `*.go` instead of adding `*.go.txt`. The configured Go checks and the whole landed k-executor-loop-module-path acceptance stay unchanged and green.
- Omitted: nothing.

## Tests
- A bare `kogen-loop/` import in a `features/steps/*.go.txt` template makes the landed scenario fail: acceptance scenario "A bare loop import in a generated-test template fails the landed import check". It copies the working tree, breaks overload_capture_test.go.txt, and runs the landed scenario through Cucumber. It must fail on current main (regression)
- The landed scenario still passes on the unchanged tree: acceptance scenario "The landed import check passes on the unchanged tree" (regression)
- A bare import in a Go source, including a build-ignored one, still fails the landed scenario: acceptance scenario "A bare loop import in a build-ignored Go source still fails the landed import check" (regression)
- The rest of the landed k-executor-loop-module-path acceptance and the Go suite are unchanged: the configured checks (existing)

## Feasibility
- Reproduced on main 34f4718 in a scratch copy (go1.27.2, node v24.21.0, Cucumber 13.3.0 from `$KOGEN_CUCUMBER`). With a bare `"kogen-loop/sys"` in features/steps/overload_capture_test.go.txt, the landed grep exited 1 (no match), so the landed scenario passes. The widened grep matched the line (exit 0). On the unchanged tree the widened grep exited 1. A bare import in a compiled Go file is also caught by the scenario's `go list -deps -test` (exit 1, "package kogen-loop/sys is not in std"). That is why the Go-source control uses a `//go:build ignore` file, which only the grep sees.
- I ran this feature and step file in scratch copies outside the checkout. On unchanged main, only the template scenario failed: the landed scenario reported PASSED where FAILED was expected. With the landed grep changed to `--include=*.go --include=*.go.txt`, all 3 passed. With `--include=*.go` replaced by `--include=*.go.txt`, which is a plausible wrong fix, only the build-ignored Go scenario failed. These were external-session probes, not Kogen probe records.
- No evidence obligation is declared. The step's observer reads the real Cucumber message report of a single-step scenario. Its known-good outcome (PASSED, exit 0, scenario 1) and known-bad outcome (FAILED, exit 1, scenario 3) both come from real runs on the unchanged tree. Neither is masked by the missing-feature red.
- No external documentation lookup was needed.
