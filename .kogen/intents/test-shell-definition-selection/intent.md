# Test how ShellDefinitions selects definitions

Slug: test-shell-definition-selection
Model: not applicable — ShellDefinitions is a stateless pure selection with no meaningful state
Acceptance:
- .kogen/intents/test-shell-definition-selection/acceptance.feature
- features/steps/test-shell-definition-selection__steps.js

Add direct tests to core/util_test.go for core.ShellDefinitions, which combines the shell definition of the supplied *tools.Tools with the shared definitions of the other requested tools. Only core/util_test.go changes: tool definitions and runtime behavior (core/util.go and everything else) stay exactly as they are.

The tests assert two behaviors. (1) When "shell" is among the requested names, the entry at the shell's position equals the definition returned by the supplied tools' Definition("shell") (not the shared tools.Definition("shell")), and every other entry equals the shared definition of its name (tools.Definition), in the requested order, with exactly one entry per requested name. The test requests several names with "shell" neither first nor last, so returning the generic shell definition, reordering, moving the shell entry, dropping or adding an entry, or substituting the shell definition for other entries fails the comparison. (2) When "shell" is not requested, the result equals the shared definitions of the requested names in the requested order, with no extra entries, and the test passes a nil *tools.Tools so that any consultation of the supplied tools fails the test.

## Decisions
- The tests are added to core/util_test.go next to the existing Display and InspectString tests, in package core, and compare with reflect.DeepEqual against definitions built from tools.Definition and the supplied tools' Definition("shell"). (evidence: core/util.go; core/util_test.go) (source: request)
- Returning the generic shell definition instead of the supplied tools' definition must fail the shell test: the test compares the shell entry with the supplied tools' Definition("shell"). Acceptance makes this observable by running the core tests in a scratch copy where the supplied tools' Definition("shell") carries one extra key relative to the generic definition. (evidence: core/util.go) (source: request)
- The no-shell case passes a nil *tools.Tools; ShellDefinitions must then return the shared definitions without touching the supplied tools, which is how "without consulting a runtime shell definition" is made observable. (evidence: core/util.go) (source: request)
- No production change: core/util.go must remain identical to HEAD. (evidence: core/util.go) (source: request)
- Acceptance is by mutation: in a scratch copy of the tree, core/util.go is changed in one wrong way and `go test ./core` must fail with a failing test (not a build failure), after the same command passed on the unchanged ShellDefinitions. Acceptance does not name any test the Build adds. (source: request)
- Tests added to core/util_test.go compare ShellDefinitions output with DeepEqual against tools.Definition entries and the supplied tools' Definition("shell"); acceptance is by mutation of a scratch copy of core/util.go. (decision: D1, round 1) (constraint: core/util.go stays identical to HEAD) (evidence: core/util.go; core/util_test.go) (assumption: With a real *tools.Tools, Definition returns the generic definition, so generic-versus-supplied shell substitution is not observable.) (source: request)

## Source comparison
- Addressed: request acceptance 1 (shell entry matches the supplied tools' definition, other entries match shared definitions, requested order; returning the generic shell definition or reordering entries fails) maps to the generic-shell-definition, reverse-order, shell-moved-to-front, every-entry-replaced, dropped-entry and extra-entry scenarios.
- Addressed: request acceptance 2 (no shell requested keeps names and order without consulting a runtime shell definition; unconditional shell substitution fails) maps to the every-entry-replaced and reads-the-supplied-tools scenarios.
- Addressed: scope core/util_test.go only and out of scope tool definition or runtime changes, via the unchanged core/util.go check in every scenario.

## Tests
- Shell requested: result has the supplied shell definition at the shell position and shared definitions elsewhere, in requested order: add a test calling ShellDefinitions with names including shell mid-list and DeepEqual against the expected list (unit)
- Shell not requested: result equals the shared definitions in requested order and does not use the supplied tools: add a test calling ShellDefinitions(nil, names) and DeepEqual against the shared definitions (unit)

## Feasibility
- none
