# Pin executor request bodies in contract tests

Slug: k-exec-contract-wire-goldens
Model: not applicable — test-only deterministic snapshots have no meaningful state
Acceptance:
- .kogen/intents/k-exec-contract-wire-goldens/acceptance.feature
- features/steps/k-exec-contract-wire-goldens__steps.js

Add executor-owned request-body goldens and tests to contract/, generated from current main without changing production behaviour. Catch agent tool-definition wire drift at executor landing rather than only at kogen adoption. Retain useful existing budget and compatible-origin contract tests. This replaces stale candidate 9b18721d (Build 5e2e33f8), not current main's renamed loop dependency.

## Decisions
- No production behaviour change, new Kogen CLI commands or flags, raised production timeout, or edits to kogen's cli/go.mod and go.sum. Keep this change restricted to contract tests/fixtures and README documentation. (source: request)
- Use synthetic offline fixtures, no model calls or consumer checkout at test runtime. (source: request)
- Import github.com/KogenAI/kogen-loop/provider, not kogen-loop/provider, on current main. (source: request)

Add contract/request_golden_test.go and contract/testdata/loop_knobs_golden.json. Build requests through agent.Defs and agent.AsAny covering all seven current generic tools in existing order: shell, view_image, read_file, write_file, list_files, search_text, documentation. Exercise provider.Client.Render with fixed instructions, user input and CacheID. Cover Responses, Messages and Chat Completions (chatgpt, anthropic, openai-compatible), using valid roles from the pinned provider's existing baseline fixtures. Record complete serialized rendered bodies, including descriptions and schemas, not just names or hashes. Compare deterministic serialized body strings byte for byte, without lossy JSON decoding of those strings. The enclosing golden uses internal/golden's existing JSON format. Generate initial contents from unchanged main a75a8ec3e1a30ebac6d7c21b87e975723355fb28, not hand-authored expectations or modified definitions.

Plain go test ./contract/... must fail on drift and write nothing. Reuse the existing test-only -update path for deliberate regeneration; document this golden in README's golden section. Failures identify cli/research_removal_test.go and cli/testdata/loop_knobs_golden.json as paired consumer items. Phase-owned tools remain outside agent.Defs. Preserve contract/TestResponseBudget and TestWithOriginHint unchanged as equivalent coverage of cli/response_budget_test.go and cli/compatible_login_test.go; avoid redundant copies.

Acceptance validates a retained SHA-256 over production Go source paths and bytes plus go.mod/go.sum, then copies that unchanged production and candidate tests to a temporary directory. It supplies an empty do-nothing golden if absent, checks plain and update runs preserve the initial bytes, changes the first agent definition's description to `wire drift sentinel`, proves compilation still succeeds and requires the ordinary gate to reject drift without rewriting the golden. It needs no Git history. The production fingerprint preserves the CLI, dependency manifests and timeouts. Review must verify complete body coverage for all three wire formats; a single description mutation is not exhaustive proof of the test implementation.

## Source comparison
- Addressed: request F13 and Need through executor-owned complete request-body snapshots and executable drift rejection; existing budget/origin contracts are retained, not duplicated.
- Addressed: byte-for-byte/no-behaviour-change requirement through fingerprint-verified unchanged-production rendering, update equality and test-only scope.
- Addressed: stale candidate failure `package kogen-loop/provider is not in std` through current github.com/KogenAI/kogen-loop/provider imports and compiled ordinary contract gate execution.
- Addressed: constraints through production/manifest preservation; no consumer repository changes, CLI additions or timeout changes.
- Superseded: stale candidate 9b18721d implementation is not restored; current main is the generation baseline. The failed history-dependent acceptance approach is replaced by a retained production fingerprint and local copy.
- Omitted: no requested behaviour intentionally omitted. Phase-owned definitions are not executor's generic agent definitions on current main (agent/defs.go, contract/agent_test.go).

## Tests
- Complete generic agent request bodies are pinned for three wire formats: add contract request golden comparison using provider.Client.Render and deterministic serialization (integration)
- Ordinary gate rejects tool-description drift without rewriting the golden: acceptance mutates agent.Defs on unchanged production with candidate contract tests (regression)
- Golden matches unchanged production bytes and deliberate regeneration is deterministic: acceptance compares golden before/after -update on fingerprint-verified production (integration)
- CLI dependencies timeouts and production remain unchanged: acceptance compares production source and manifest fingerprint (regression)
- Budget and compatible-login contracts stay pinned: preserve TestResponseBudget and TestWithOriginHint (existing)
- Current renamed loop module compiles: acceptance compiles and runs contract tests on current-main dependencies (regression)

## Feasibility
- Existing go test ./contract/... passed (probe 1: exit 0, 1.1 s). Pinned provider source inspection confirmed offline Client.Render and the three wire families; follow-up inspection probes exited 0. A Git-dependent fingerprint probe failed because probe copies lack Git metadata; a filesystem-based fingerprint probe succeeded, exit 0, 0.1 s. No external protocol or provider behaviour is changed.
- Inspected readiness observations-13.txt: the real mutated contract package compiled and passed, so acceptance failed specifically because the unchanged suite accepts wire drift. This is legitimate missing-feature red, not a missing file or fixture failure.
- evidence: {"id":"drift-observer","kind":"observer","inputs":["features/steps/k-exec-contract-wire-goldens__steps.js"],"observers":["features/steps/k-exec-contract-wire-goldens__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-contract-wire-goldens__steps.js good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-contract-wire-goldens__steps.js bad","exit":1,"output":"observer rejected\n"}]}
