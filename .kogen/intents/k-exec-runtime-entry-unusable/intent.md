# Reject unusable managed runtime entries

Slug: k-exec-runtime-entry-unusable
Model: not applicable — this changes a filesystem validation predicate, not executor session state; installation and user-directed removal retain their existing lifecycle
Acceptance:
- .kogen/intents/k-exec-runtime-entry-unusable/acceptance.feature
- features/steps/k-exec-runtime-entry-unusable__steps.js

Before starting any role, accept the managed runtime only when it resolves to a nonempty regular executable file. Replace the inconsistent Lstat existence / Stat existence gates in ensureRuntime, the install-lock recheck and binary with one definition. A genuinely absent entry still installs normally. An existing unusable entry must fail executor/unavailable, name its kind and instruct the user to remove the exact RuntimeDir(home) folder and run again. Never remove or overwrite such an entry or its symlink target. Keep cleanup of installer-owned partials and the reported-version pin check unchanged. Do not attempt to repair user entries automatically. Inspection failures are not evidence of absence.

## Decisions
- Diagnose dangling links, directories, empty files and non-executable files rather than calling them not installed; empty or not executable is acceptable for a zero-byte file. A resolved symlink to a suitable regular executable remains acceptable. (source: request)
- Use the existing managed folder and pinned version 2.1.312, with KOGEN_CLAUDE_CODE_URL for synthetic loopback installation; no provider calls or new settings. (source: request)
- After the user removes the named version folder, the next start installs and succeeds. No automatic deletion of preexisting invalid content. (source: request)

## Source comparison
- Addressed: Problem's disagreement between link-level presence and following presence is replaced by the shared usability predicate above, including the install-lock recheck in runtime.go and binary in claudecode.go.
- Addressed: Need's regular/executable criterion, kind-specific actionable refusal, preservation of user entries, absent installation and unchanged version pin are covered by the outcome and scenarios.
- Addressed: all Synthetic acceptance examples (dangling link, directory, zero-byte, mode-0644, valid pinned runtime, absent runtime from test origin, removal then retry) appear in acceptance.feature. Exact folder is computed through the existing RuntimeDir convention, not a guessed alternative location.
- Superseded: existing entries no longer bypass installation validation or produce the generic not-installed message. No requested behavior is omitted; detecting arbitrary nonempty corrupt executable payloads beyond the stated filesystem criterion is not a new binary-format validator. Existing execution/version checks remain.
- Addressed: requested slug, Intent paths, step naming and sentence prefix are retained. README checks and testing rules remain unchanged; no protected production edit is required.

## Tests
- Unusable entries fail unavailable with kind and exact removal remedy, preserving content and avoiding downloads: add Start filesystem regressions and acceptance outline (regression)
- User removal permits subsequent installation and successful Start: synthetic loopback recovery scenarios (integration)
- A valid pinned executable starts without installation and absent runtime installs: synthetic Start scenarios plus existing runtime installation tests (integration)
- Presence classification agrees across ensure, locked install recheck and binary, with version pin unchanged: extend runtime tests and retain existing version tests (integration)

## Feasibility
- evidence: {"id":"diagnostic-observer","kind":"observer","inputs":["features/steps/k-exec-runtime-entry-unusable__steps.js"],"observers":["features/steps/k-exec-runtime-entry-unusable__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-runtime-entry-unusable__steps.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-runtime-entry-unusable__steps.js bad","exit":1,"output":"rejected\n"}]}
