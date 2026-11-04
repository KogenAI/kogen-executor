# Report dropped protected paths at Start

Slug: k-exec-protected-paths-dropped-visible
Model: not applicable — stateless input classification and Start preflight validation introduce no meaningful new state
Acceptance:
- .kogen/intents/k-exec-protected-paths-dropped-visible/acceptance.feature
- features/steps/k-exec-protected-paths-dropped-visible__steps.js
- features/steps/k-exec-protected-paths-dropped-visible__event.js

Make Claude Code Start report ignored protection inputs rather than silently reducing requested protection. Classify Task.Protected before writing hook-policy.json or claude-settings.json. Preserve usable-path normalization, ordering, duplicates and hook enforcement. Do not change authentication, runtime selection or unrelated start-event content.

## Decisions
- Empty after TrimSpace and outside-checkout entries remain nonfatal; successful executor_started events report dropped entries in input order only when drops exist. (source: request)
- Root or ancestor entries fail Start with typed executor ReasonUnavailable identifying the offending original entry, without policy/settings files or executor_started. Include relative `.` and `..`, absolute root and absolute ancestors. An escaping sibling `../x` is outside_checkout, not an ancestor. Classify empty before cleaning. (source: request)
- Encode drops as `protected_dropped_count` (full count) and `protected_dropped` (first 20 objects with `entry` and `reason`). Reasons are `empty`, `outside_checkout`, `root_or_parent`; fatal root_or_parent appears in the unavailable diagnostic rather than a successful event. Bound each original entry to 256 UTF-8 bytes, truncating at a character boundary without suffix. Count is one fixed-width integer, not capped at 20. These spellings and limit settle unspecified technical encoding. (source: request)
- Exercise the synthetic `/r` example using `$ROOT` replaced by a real temporary checkout: `a/b.txt`, ` ./c `, `$ROOT/d/e` must yield exactly `a/b.txt`, `c`, `d/e`. No real provider/network is needed. (source: request)

## Source comparison
- Addressed: Problem and all Need bullets map to refusal, bounded metadata and preservation above and acceptance below. Silent filtering at executor/claudecode/claudecode.go:435–452 is superseded only for classification/reporting.
- Addressed: synthetic cases 1–4 map to usable, mixed, rejected outline and count-boundary scenarios; `/r` is a fixture root placeholder, not a host directory requirement. Empty/outside remain successful; root/parent cannot silently disappear.
- Addressed: bounded entries are concretized at 256 UTF-8 bytes; first 20 and full count 100 are preserved. Other event fields are compared across Start calls, excluding only the random session ID. No requested product behavior is omitted. README synthetic testing conventions are preserved. No external Claude protocol change is requested.

## Tests
- Usable normalization/order and absent metadata for no drops: preserve TestCleanProtected coverage and exercise Start with supplied inputs (regression)
- Empty/outside classification and original entry reporting: focused classification tests including whitespace and ../x (unit)
- Nonfatal drops reach executor_started and policy excludes them: fake-Claude Start scenarios (integration)
- Root and ancestors refuse typed unavailable before policy/settings creation: rejection outline and focused classification cases (regression)
- First-20 list, full count and 256-byte entry limit including multibyte boundary: boundary scenarios and focused UTF-8 truncation tests (unit)
- Existing event fields and usable hook policy remain unchanged: retain adapter/hook tests and compare against no-drop Start excluding session ID (integration)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-protected-paths-dropped-visible__steps.js"],"observers":["features/steps/k-exec-protected-paths-dropped-visible__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-protected-paths-dropped-visible__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-protected-paths-dropped-visible__steps.js bad","exit":1,"output":"observer bad rejected\n"}]}
- evidence: {"id":"event-observer","kind":"observer","inputs":["features/steps/k-exec-protected-paths-dropped-visible__event.js"],"observers":["features/steps/k-exec-protected-paths-dropped-visible__event.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-protected-paths-dropped-visible__event.js good","exit":0,"output":"event observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-protected-paths-dropped-visible__event.js bad","exit":1,"output":"event observer bad rejected\n"}]}
