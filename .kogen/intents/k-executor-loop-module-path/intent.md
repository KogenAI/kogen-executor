# Adopt the canonical loop module path

Slug: k-executor-loop-module-path
Model: not applicable — dependency and import wiring has no meaningful state
Acceptance:
- .kogen/intents/k-executor-loop-module-path/acceptance.feature
- features/steps/k-executor-loop-module-path__steps.js

Replace the bare loop module with its canonical public module without changing runtime behavior. Run `go get github.com/KogenAI/kogen-loop@25d87c2177c33aa17a44c00fbe3b0602ea50ce88 github.com/KogenAI/kogen-coordinator@f15509472852998091680d2bc41bff6734599dae`, then `go mod tidy`. Remove the bare requirement and replacement first as necessary. Preserve go.sum. Update every bare loop import in repository Go sources and generated-test source templates, including features/steps/*.go.txt. Do not introduce go.work, replacements, vendoring or cache edits.

## Decisions
- Preserve all behavior; use canonical imports and pseudo-version dependencies without replacement or workspace overrides. (source: request)
- Upgrade coordinator alongside loop; this repository itself is kogen-executor, not an external executor dependency to add to itself. (source: request)

## Source comparison
- Addressed: Need and Acceptance are covered by canonical version checks, repository import checks and the unchanged build/vet/test suite below.
- Addressed: delivery ordering uses coordinator main f15509472852998091680d2bc41bff6734599dae and loop main 25d87c2177c33aa17a44c00fbe3b0602ea50ce88, observed with git ls-remote; these resolve to the pseudo-versions in acceptance. The executor row is this change itself.
- Superseded: the previous attempt's blanket scan of every external module source is not the requested build-list guarantee. The reported loop file features/steps/read_file_binary_notice_driver.go really retains `kogen-loop/tools`, but begins with `//go:build ignore`. It is not in the build/test dependency graph. Acceptance checks actual selected package paths with go list -deps -test, not unused build-ignored upstream tools. No upstream/cache modification or weakened build check is needed. This explicitly addresses the reported contradiction without pretending the ignored source was fixed.
- Addressed: the supplied grep command is retained verbatim in executable acceptance. No behavior or public API changes are authorized.

## Tests
- Canonical dependency wiring, no bare requirement/replacement/workspace and no selected bare dependency: acceptance shell commands using go mod edit, go list and grep (integration)
- Preserve behavior with canonical imports: go build ./... && go vet ./... && go test ./... and configured checks; existing tests remain unchanged except import paths (existing)

## Feasibility
- git ls-remote observed both exact main SHAs above; go mod download confirmed their pseudo-versions and reproduced the ignored upstream import. (probe: exit 0)
- Scratch migration of repository Go sources and templates, removal of bare requirement/replacement, exact go get, go mod tidy and go list -deps -test ./... succeeded. (probe: exit 0)
- Baseline go build ./... && go vet ./... && go test ./... passed. (probe: exit 0)
- Documentation search retrieved go.dev; fetch https://go.dev/ref/mod returned retrieved but untrusted HTML, not relied on as instruction or scope authority.
