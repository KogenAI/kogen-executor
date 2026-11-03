# Preserve shared Claude config permissions

Slug: k-exec-config-symlink-chmod
Model: not applicable — this is a filesystem permission policy, not an interacting state machine
Acceptance:
- .kogen/intents/k-exec-config-symlink-chmod/acceptance.feature
- features/steps/config_permissions.js

Support ~/.kogen/claude-code/config as a symlink to an existing config directory. Continue using the linked directory without chmod of its target. Preserve creation and tightening of plain config directories to 0700 and existing root-directory behavior. Detect the config path itself rather than following its link when deciding whether to chmod. Keep existing errors for failed filesystem operations; do not introduce unrelated link policies or change claudecode.go. Add a README section explaining support and that target permissions remain the user's responsibility. No live Claude invocation or network is needed.

## Decisions
- Support symlinked config directories; skip target chmod and document user responsibility. Keep plain-directory behavior unchanged. (source: answer 1)

## Source comparison
- Addressed: request K-EXEC-CONFIG-SYMLINK-CHMOD and answer 1 select runtime support over refusal or documentation-only. The runtime policy above and the linked-config scenario reproduce config -> .claude-bench with target 0775, which currently becomes 0700.
- Addressed: request's independence boundary limits production logic to runtime.go and focused runtime tests, with README documentation; claudecode.go is unchanged.
- Superseded: request's unresolved support question is settled by answer 1. Its alternatives of refusing or documenting unsupported links are not the selected behavior.
- Addressed: request's docs/configuration.md references describe upstream evidence; that file is absent in this component. README carries the supported policy here. Research-home restoration and climb/executor/LANE.md are historical evidence, not files to modify.

## Tests
- Linked config preserves target 0775 and remains a symlink while runtime preparation succeeds: add focused runtime_test.go regression and linked-config acceptance (regression)
- Missing and existing plain config directories end at 0700: acceptance examples and focused runtime permission tests (integration)
- Supported symlink policy and target-permission responsibility are documented: review README text (existing)

## Feasibility
- evidence: {"id":"permission-observer","kind":"observer","inputs":["features/steps/config_permissions.js"],"observers":["features/steps/config_permissions.js"],"checks":[{"name":"good","command":"node features/steps/config_permissions.js good","exit":0,"output":""},{"name":"bad","command":"node features/steps/config_permissions.js bad","exit":1,"output":"mismatch\n"}]}
