# Add a go test -update path for the golden files

Slug: k-golden-update-executor
Model: not applicable — the tests rewrite two files from deterministic output; there is no state or interacting rule to model
Acceptance:
- .kogen/intents/k-golden-update-executor/acceptance.feature
- features/steps/golden_update_steps.js

The tests in this repository compare with two recorded goldens, `agent/testdata/defs_golden.json` and `agent/testdata/prompts_golden.json`. Nothing can regenerate them today: there is no `-update` flag, no environment switch and no write path, and Builds edited them by hand. This Intent adds one documented, test-only update path: `go test ./... -update`. With the flag, the golden tests rewrite each golden from the current code's actual output. A follow-up run without the flag then passes. Without the flag, every golden test behaves exactly as it does today: the same comparisons, the same failure on any drift, and nothing is written.

Today `go test ./... -update` fails in every test package with `flag provided but not defined: -update` (observed in `thinking`). After this change, every package with tests accepts the flag.

Boundaries: the flag exists only in test binaries. It is never a command, flag, config key or environment variable of the kogen program. There is no new user-visible option and no test timeout is raised. The inline hash constants in `TestReviewerBatchPromptBytesAndUnchangedSchema` (the reviewer prompt hash and the `defs.go` source hash) are not golden files: they stay as they are and `-update` does not touch them. The historical Elixir generators `agent/testdata/gen_static.exs` and `agent/testdata/gen_tools.exs` stay unchanged. The observer-control files under `features/steps/golden_update_controls/` are shaping evidence for the acceptance steps; the Build leaves them unchanged.

Technical choices made in shaping:
- `go test ./... -update` must work across the whole module. Packages without goldens therefore also accept the flag, through the shared `internal/golden` package. This answers the observed `flag provided but not defined: -update` failure.
- Goldens are written as two-space-indented JSON with sorted keys and unescaped HTML characters. Regenerating an unchanged tree then produces no diff, and a real change diffs line by line. The current prompts golden already has this exact format.

Implementation contract:
- New package `github.com/KogenAI/kogen-executor/internal/golden` (`internal/golden/golden.go`) is the one shared update path. It registers the test flag `flag.Bool("update", false, ...)` and exposes:
  - a way to read it (for example `golden.Update() bool`);
  - the shared JSON writer (for example `golden.WriteJSON(t testing.TB, path string, v any)`). The writer uses `encoding/json`'s `Encoder` with `SetEscapeHTML(false)` and `SetIndent("", "  ")`. Object keys come out sorted (Go maps) and the file ends with exactly one newline.
- Only `_test.go` files import `internal/golden`; no non-test package imports it. Being `internal` to this module, it cannot be imported by the kogen program.
- Every package that has tests imports `internal/golden` from a `_test.go` file, as a blank import where it has no goldens: `agent`, `executor/claudecode`, `executor/conformance`, `testproc` and `thinking`. That way `go test ./... -update` succeeds module-wide. A package that gains tests later follows the same rule.
- `TestPromptsAreByteEqualToTheElixirFunctions`, with `-update`:
  - It writes `agent/testdata/prompts_golden.json` as a map from prompt name (every name in `Names()`) to `{"bytes": <int>, "sha256": "<lowercase hex>"}`.
  - The values are computed from exactly the text the test compares today. For the reviewer, that means the `LimitRaises` line is removed and `reviewerBatchParagraph` is replaced by `reviewerOldSentence`, so the historical Elixir record is kept.
- `TestDefinitionsMatchTheElixirDefinitions`, with `-update`: it writes `agent/testdata/defs_golden.json` as a map from each Kogen-owned tool name in `everyTool` (names for which `tools.Definition` reports not loop-owned) to `Defs(name)[0]` after a JSON round trip. Loop-owned definitions stay out of the golden.
- With `-update`, a golden test writes without reading or parsing the old golden. A golden left with merge-conflict markers or hand drift is therefore regenerated. Writing replaces only the comparison with the golden; the test's other assertions and test names stay as today. Without `-update`, both tests are unchanged.
- The current `prompts_golden.json` is already in the writer's format, so it must stay byte-identical. The current `defs_golden.json` is one compact line with mixed key order. This Build regenerates it once with `go test ./agent -update` and commits the indented file. Its JSON values must stay unchanged.
- The comments of both golden tests say:
  - what the golden holds;
  - that `go test ./... -update` rewrites it from the current output.
  The comment of `TestPromptsAreByteEqualToTheElixirFunctions` also keeps the rule that `prompts_golden.json` records the prompt bytes Kogen's models have always received, so it changes only deliberately and every change is reviewed as a diff of that file.
- In `README.md`'s Testing section, document:
  - the command `go test ./... -update`;
  - the goldens it rewrites (`agent/testdata/defs_golden.json`, `agent/testdata/prompts_golden.json`);
  - when to use it: only after an intended change to the prompts or to Kogen-owned tool definitions changes a golden, or to resolve a merge or cherry-pick conflict in a golden by regenerating it on the combined tree; never to make an unexplained failure pass;
  - that the regenerated golden's diff must be reviewed (a change to `prompts_golden.json` must be deliberate);
  - that the full checks then run again without the flag.

## Decisions
- The update path is the Go test flag `-update`, run as `go test ./... -update`; it is read only by tests and is not part of the kogen program (source: request)
- Without the flag, every golden test compares and fails on drift exactly as today; with it, the golden tests write the goldens, and a follow-up run without the flag passes (source: request)
- Hash-pinned goldens such as `prompts_golden.json` keep their deliberate-change rule; an update of them shows up as a reviewable diff of that file, and each test's comment says what its golden holds (source: request)
- Synthetic fixtures only, no new user-visible option, no raised timeouts (source: request)

## Source comparison
- Request "one documented update path shared by all golden tests: a Go test flag such as `go test ./... -update`": addressed by `internal/golden`, the flag in every test package and the README; scenarios 1 and 3.
- Request "rewrites each golden from the current code's actual output": addressed for both goldens in this repository (`agent/testdata/defs_golden.json`, `agent/testdata/prompts_golden.json`); scenarios 1 and 2.
- Request "never a CLI command, flag, config key or environment variable of the kogen binary": addressed. The flag lives in a module-internal package that only `_test.go` files import (scenario 3); this repository builds no kogen binary.
- Request "without the flag ... same comparisons, same failure on any drift; with the flag, the tests write the goldens; a follow-up run without the flag must pass": scenario 1, with a conflicted prompts golden and a drifted defs golden; scenario 2, with a code change.
- Request "goldens that must not change without deliberate intent keep that rule; updating them still shows up as a reviewable diff; the test file says what each golden holds": the prompts golden's values stay byte-identical (scenario 3). A deliberate prompt change reaches it only through `-update`, as a one-entry diff (scenario 2). The test comments are an Implementation contract item.
- The request's example `force_ordinary_golden.json` ("records bytes from before enforcement existed") and the other goldens it names (`shape/testdata/...`, `build/testdata/...`, `reviewretry/*.wire.json`) live in other Kogen component repositories: omitted here, and handled by the same item in those repositories. This repository's analogue is `prompts_golden.json`, the historical Elixir record.
- Request "synthetic fixtures only; no new user-visible option; no raised timeouts": the scenarios use scratch copies with synthetic drift. No option is added and no test timeout is raised; the acceptance step limits belong only to the new acceptance harness.
- Request evidence (the 2 Nov landings of K-SHAPE-DECIDE-NON-UX and K-MODELS-FILE, and the 3 Nov rebuild) is the motivation. Delivery will regenerate goldens on the combined tree with this flag and then run the full checks; the README documents that use.
- Existing inline hash pins in `TestReviewerBatchPromptBytesAndUnchangedSchema` are not golden files: unchanged and not regenerated.

## Tests
- `go test ./... -update` is accepted by every package with tests and rewrites both goldens from the current output, including a golden left with merge-conflict markers and one with hand drift, so that the files equal the committed goldens and a plain `go test ./...` then passes: acceptance scenario 1 (scenario)
- Without the flag, the golden tests fail on drift and write nothing: acceptance scenario 1, before the update, plus the unchanged `TestPromptsAreByteEqualToTheElixirFunctions` and `TestDefinitionsMatchTheElixirDefinitions` (existing)
- A deliberate prompt change fails the plain run and, with `-update`, changes only its own entry of the hash-pinned `prompts_golden.json`, to the new text's bytes and SHA-256. Its diff is reviewable, and a plain run then passes: acceptance scenario 2 (scenario)
- The committed goldens keep today's values: `prompts_golden.json` keeps its exact bytes, and `defs_golden.json` keeps the same JSON value in the writer's format: acceptance scenario 3 (scenario)
- The README documents `go test ./... -update`, the two goldens and when to use the flag: acceptance scenario 3 (scenario)
- The flag stays test-only: `internal/golden` exists and no non-test package imports it: acceptance scenario 3 (integration)

## Feasibility
- `go test -count=1 ./thinking -update` on the unchanged tree fails with `flag provided but not defined: -update`. So `go test ./... -update` needs the flag registered in every test package, not only in `agent`. (local observation)
- A Go encoder with `SetEscapeHTML(false)` and `SetIndent("", "  ")` reproduces today's `agent/testdata/prompts_golden.json` byte for byte, using the values the test compares (including the reviewer transformation). The same encoder writes `defs_golden.json` with an unchanged JSON value (canonical SHA-256 `2d9742afddcb58033a0081332fd5feefecf7e5a3a8cf2a734032f14415e1d599`). (local observation in a scratch copy)
- The whole module's `go test -count=1 ./...` takes about 20 s in a scratch copy outside the work tree. (local observation)
- evidence: {"id":"acceptance-observer","kind":"observer","inputs":["features/steps/golden_update_controls/observe.sh","features/steps/golden_update_controls/good.patch","features/steps/golden_update_controls/bad.patch"],"observers":["features/steps/golden_update_steps.js",".kogen/intents/k-golden-update-executor/acceptance.feature"],"checks":[{"name":"good","command":"sh features/steps/golden_update_controls/observe.sh good","exit":0,"output":"3 scenarios (3 passed)\n"},{"name":"bad","command":"sh features/steps/golden_update_controls/observe.sh bad","exit":1,"output":"AssertionError [ERR_ASSERTION]: agent/testdata/defs_golden.json after go test -count=1 ./... -update differs from the checkout's:\n3 scenarios (2 passed, 1 failed)\n"}]}
