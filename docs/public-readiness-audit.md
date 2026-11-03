# Public readiness audit

## Current tree

The README now describes public setup and retains package, configuration, test,
golden and licensing guidance. Prior Intent prose referring to an unavailable
research record was made neutral without changing its historical observations.
Runtime configuration paths are supported interfaces. Fixture URLs, credentials
and synthetic homes in tests and acceptance examples are inputs, not links or
real credentials. The embedded testing-rules prompt remains executable model
input with golden coverage, not a public setup handoff; changing it would change
runtime behavior. License and notice terms were not changed.

## Links

Observations for external links are HTTP GETs following redirects during this
audit; they establish availability from this environment, not a permanent
availability guarantee. Relative targets were checked in the checkout.

| File | Destination | Observation |
| --- | --- | --- |
| README.md | https://github.com/KogenAI/kogen | HTTP 200 |
| README.md | https://github.com/KogenAI/kogen-executor | HTTP 200 (clone destination) |
| README.md | docs/configuration.md | Relative target exists |
| README.md | docs/executor-contract.md | Relative target exists |
| README.md | LICENSE | Relative target exists |
| README.md | NOTICE | Relative target exists |
| LICENSE | http://www.apache.org/licenses/ | HTTP 200 after redirect to HTTPS |
| LICENSE | http://www.apache.org/licenses/LICENSE-2.0 | HTTP 200 after redirect to HTTPS |
| docs/configuration.md | executor-contract.md | Relative target exists |
| .kogen/intents/core-display-float-parity/intent.md | https://hexdocs.pm/elixir/Float.html | HTTP 200 after redirect |
| .kogen/intents/k-exec-kill/intent.md | https://pkg.go.dev/os/exec | HTTP 200 |
| .kogen/intents/k-exec-token-pipe-backpressure/intent.md | https://pkg.go.dev/os/exec | HTTP 200 |
| .kogen/intents/k-exec-round-limit-state/intent.md | https://platform.claude.com/docs/en/agent-sdk/typescript | HTTP 200 after redirect |
| .kogen/intents/k-public-ready-executor/intent.md | https://kogen.dev | HTTP 200 |
| .kogen/intents/k-public-ready-executor/intent.md and acceptance.feature | https://github.com/KogenAI/kogen | HTTP 200 |
| .kogen/intents/k-public-ready-executor/acceptance.feature | https://github.com/KogenAI/kogen-executor | HTTP 200 |

Synthetic URL strings in executable acceptance tables are excluded; their
assertions are unchanged. The approved Intent and acceptance are shaping
artifacts, included above for completeness. The URLs listed in this audit
repeat the inventoried destinations rather than introducing new destinations.

## History

### Coverage

Inspected all 24 commits reachable from local refs with `git rev-list --all`,
from root `1aea0728c24b1dad83502e3500457be1b59b829f` to tip
`94a9bc0d0f1ee727d124e709e84e6327c5318ded`. Searched all reachable
snapshots for environment paths, named execution hosts and restricted-module
configuration; inspected all-commit diffs for these, URLs and handoff text,
and reviewed current Intent prose and tracked Markdown links. Also inspected
commit author/committer metadata. Search is bounded by local reachable refs;
unreachable objects, external repositories and private workspace history were
not inspected. Pattern searches and contextual review cannot guarantee discovery
of every possible identity or secret. No history was rewritten; the owner
decides any action on historical findings.

### Inventory

| Full commit | Repository-relative file | Sanitized finding and status |
| --- | --- | --- |
| 1aea0728c24b1dad83502e3500457be1b59b829f | README.md | Added obsolete restricted-module setup; persists through the inspected tip and is removed from the current tree. |
| eb7bdcf833d277ce1d0243d2bf90d17f257a3c8d | features/steps/golden_update_steps.js | Added a restricted-module environment default in an executable acceptance helper; still present, outside documentation-only scope. |
| be11a186753fd53feb7f71ac6e60f5102631f45f | .kogen/intents/k-exec-config-symlink-chmod/intent.md | Added reference to a workspace research record and restoration; neutralized in current prose. |
| ad14da85563e31cf0a18ea7abc906b01fe5f53da | .kogen/intents/k-exec-round-limit-state/intent.md | Added a workspace research record reference and location-specific gap; current prose retains the findings neutrally. |
| 94a9bc0d0f1ee727d124e709e84e6327c5318ded | .kogen/project.yaml | Added machine-specific host command override; protected configuration, excluded from public documentation edits. |
| 1aea0728c24b1dad83502e3500457be1b59b829f | agent/prompts/testing-rules.md | Added operational historical status and handoff guidance in an embedded, golden-tested prompt; still present as runtime input. |
| 1aea0728c24b1dad83502e3500457be1b59b829f | agent/prompts/feasibility-guidance.md | Added generic handoff guidance as embedded prompt input. |
| 1aea0728c24b1dad83502e3500457be1b59b829f | agent/prompts/refine.md, agent/prompts/shaper.md | Added generic security handoff guidance as embedded prompt input. |
| 2f13bd4bf08deff23fe702d4356d8802b2b15144 | agent/prompts/feasibility-guidance.md, agent/prompts/refine.md, agent/prompts/shaper.md | Removed those phase prompts from this component. |

All 24 inspected commit objects contain the same personal author and committer
identity in Git metadata (not a repository-relative file). Synthetic test
homes and fixture credentials were also found but are not real identities or
credentials. No additional named-host or identifying checkout-path occurrences
were found in the searched snapshots beyond the host override above. No claim is
made about inaccessible history or unrecognized identity strings.
