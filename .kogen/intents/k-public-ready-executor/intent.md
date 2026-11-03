# Prepare executor documentation for public use

Slug: k-public-ready-executor
Model: not applicable — documentation cleanup has no meaningful state
Acceptance:
- .kogen/intents/k-public-ready-executor/acceptance.feature
- features/steps/public_ready_docs.js

Make the README and documentation useful from a public clone of KogenAI/kogen-executor. Explain the shared execution/session contracts, backend adapters and relationship to Kogen. Document Go 1.27.2 (as declared in go.mod), public cloning, dependency download and the existing build/vet/test commands. Remove obsolete restricted-module setup rather than replacing it with another authentication recipe. Keep the useful package, configuration, golden-update, contract-suite and license documentation.

Only README and documentation change during implementation. This includes committed records under .kogen/intents/: sanitize identifying environment details there with neutral placeholders while retaining each record's technical meaning, requirements and historical status. Do not edit executable step files, Go code, tests, fixtures, dependency files, generated goldens or .kogen/project.yaml. The new acceptance files are shaping artifacts, not implementation edits. Existing synthetic fixture addresses are test inputs, not reader-facing hyperlinks; retain their assertions unchanged. A synthetic test home is not an identifying real user's home. Runtime configuration path documentation is a supported interface, not a machine-specific checkout path.

Audit all tracked reader-facing links, including links in committed Intent prose. Relative links must have targets; external links must be public. Kogen-wide links use https://kogen.dev or https://github.com/KogenAI/kogen. Synthetic URL inputs in executable examples/tests are not invitations to browse and must not have their test semantics changed. Remove unavailable workspace links, machine-specific checkout paths, named execution hosts, personal identities and operational handoff notes. Describe any still-relevant technical constraint neutrally rather than erasing the record's meaning. Never alter LICENSE or NOTICE licensing terms.

Add docs/public-readiness-audit.md. It records the current-tree audit, link inventory (file, destination, public resolution observation), and a history inventory (full commit, repository-relative file, sanitized description of what was found). Include all reachable history inspected and its bounds, distinguishing added/removed historical occurrences as appropriate. Do not put raw identifying paths, names, restricted addresses or tokens back into this report. List historical occurrences of the same categories, including superseded restricted-module setup and operational handoff notes. If none are found, state that with the exact search coverage; never substitute an empty report for an unperformed search. History is immutable: no amend, rebase, filter, force push or replacement of old commits. The owner decides what to do with history. The final delivery summary also lists the historical findings, or points to and summarizes this complete committed inventory. A lack of access to Git history is an honest stop, not a claim that there are no hits.

No SECURITY.md, CONTRIBUTING.md or BRANDING.md; no contribution refusal, maintenance promise or announcement that issues and pull requests are disabled. They remain disabled; changing repository settings or introducing an API credential requirement is not part of this documentation change. Give contact@kogen.dev exactly once in README. Do not repeat it in other reader documentation.

## Decisions
- Public setup uses only the Go toolchain and public dependencies, without authentication or restricted workspace prerequisites (source: request).
- Keep the component's existing behavior and every useful assertion unchanged (source: request).
- Limit implementation edits to README and documentation, including committed Intent records; leave configuration untouched (source: request).
- Preserve history and provide a sanitized owner-facing inventory rather than rewriting it (source: request).
- Use neutral placeholders such as <checkout> for identifying environment details, preserving the meaning of historical records (source: request).
- Match supplied README literals by substring, never by constructing a regular expression from a Cucumber string parameter (source: request).

## Source comparison
- Addressed: Request Problem and Need's public component explanation, usable setup and tests, public links, contact address, absent policy files and unchanged behavior: outcome above and README/public-tree scenarios. Required public destinations and contact literal are preserved exactly.
- Addressed: Need's current-tree environment/identity cleanup and h16 addition: all committed documentation, including earlier Intent prose, is in the audit; placeholders retain technical meaning. The public-tree scenario checks identifying environment signatures; independent review checks context, personal identities and unavailable workflows as well as mechanical matches.
- Addressed: Need's history inventory: docs/public-readiness-audit.md records commit, file and sanitized finding, without rewriting history. Audit scenario checks the deliverable; independent review must check its actual search coverage and findings, not merely headings.
- Addressed: previous attempt's double-escaping bug and supplied literal Go 1.27.2: acceptance uses String.includes on already-decoded string parameters, with this exact version in the feature.
- Superseded by the re-filed scope: implementation edits to executable tests, module configuration or any protected path. Host-only command overrides are not public-tree defects and are neither edited nor counted. Inspected configuration here already uses plain commands, including GOFLAGS=-trimpath go test ./....
- Addressed with scope distinction: every reader-facing tree link must resolve publicly; deliberately synthetic fixture URL inputs and runtime configuration interfaces retain their semantics, not fictitious claims of public resolution. No executable assertion is weakened to sanitize prose.
- Addressed: issues/PRs remain disabled with no announcement; no refusal or maintenance pledge is added. No administrative settings change is requested.
- Omitted: no requested product outcome. Automated text checks are bounded evidence, not proof of every public destination or every personal name; the complete audit and independent review remain required.

## Tests
- README explains public setup, component role, canonical links, contact and unchanged testing commands: public README scenarios (scenario)
- Obsolete restricted-module instructions are removed and contact appears once: README literal/count checks (regression)
- Identifying environment signatures and unwanted policy documents are absent from public documentation: public-tree scenario plus contextual documentation review (scenario)
- Current link observations and historical findings are delivered without rewriting commits: audit document scenario plus independent inventory/history review (integration)
- Existing runtime behavior and assertions are unchanged: configured format, compile, vet and Go test checks, with the README's full race command during implementation (existing)

## Feasibility
- Public module download succeeded using an empty temporary module cache, cleared module-privacy overrides, public Go proxy and checksum database, with GOTOOLCHAIN=local: exit 0, 0.3 s. This establishes dependency availability in this environment, not every network environment.
- Documentation search for the two dependencies returned status retrieved but only unrelated broad sources; it did not establish module availability. The actual public download above supplies the relevant local evidence.
- Scratch copies have no Git metadata: a history exploration printed fatal not-a-repository diagnostics despite its shell pipeline returning 0. No historical absence or completeness is inferred. Actual history inspection is required in the implementation checkout and must be reported honestly.
- No risky generated driver or lifecycle fixture is used: acceptance reads documentation and performs direct text/existence checks.
