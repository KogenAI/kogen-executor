# Pin Claude Code 2.1.318

Slug: e-claude-code-2-1-318
Model: not applicable — a constant and release metadata update adds no meaningful state
Acceptance:
- .kogen/intents/e-claude-code-2-1-318/acceptance.feature
- features/steps/e-claude-code-2-1-318__steps.js

Replace the managed Claude Code pin with 2.1.318. Update every test, golden and executable acceptance fixture that states the managed version, using Version rather than another literal wherever possible. Preserve historical observations as history, not current expectations. Do not change download, verification, install-lock or never-use-PATH behavior; keep all existing tests green with no unrelated edits. Hook prevalidation is separate: the reported stale Write rejection before a hook and the supplied 6/6 hook observations on both old versions do not block this release bump.

Update the compiled per-platform checksum and size pins from https://downloads.claude.ai/claude-code-releases/2.1.318/manifest.json, not only the version string. Supported platforms remain unchanged. This preserves the existing compiled-pin installation strategy rather than introducing runtime manifest retrieval in production. (evidence: executor/claudecode/runtime.go)

## Decisions
- Limit acceptance to the version, managed path and refusal text; do not run earlier features as regression guards. Existing tests are checked by the configured full suite. (source: request)
- Preserve the compiled checksum table and update its release values rather than redesigning installation. (evidence: executor/claudecode/runtime.go) (source: request)

## Source comparison
- Addressed: request Need pin and managed directory through the acceptance scenario and runtime metadata update above.
- Addressed: request Need update all managed-version expectations through the repository-wide fixture/test update requirement; existing tests remain the full-suite responsibility, per the 6 Nov delivery note.
- Addressed: request no other behavior change through explicit preservation of downloading, checksums, locking and PATH exclusion. Historical hook findings are retained as context only; k-hook-prevalidation is omitted as explicitly separate work.
- Superseded: current release checksum/size literals in runtime.go and TestPinTable must become this release's manifest values, while platform support and installation strategy remain unchanged.

## Tests
- Pin the release: update TestPinTable and verify the exported Version in focused acceptance (integration)
- Derive managed path and refusal from the pin: exercise RuntimePath and NotPinnedMessage through their public interfaces (integration)
- Preserve installer and executor behavior: update existing managed-version fixtures and keep configured checks green without invoking other features from acceptance (existing)

## Feasibility
- none
