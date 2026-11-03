# Pin what consumers use in a contract suite

Slug: k-contracts-executor
Model: not applicable — the change adds tests and documentation only; there is no state or interacting rule to model
Acceptance:
- .kogen/intents/k-contracts-executor/acceptance.feature
- features/steps/contract_suite_steps.js
- features/steps/golden_update_steps.js

Today a kogen-executor landing runs the offline suites of its consumers (kogen, kogen-shaping, kogen-build) to catch interface breaks. That is slow, and the contract those consumers rely on is written down nowhere in kogen-executor. This Intent adds a `contract/` suite to kogen-executor. It pins exactly what the consumers use from this module:
- the exported API they call;
- the behaviours they rely on;
- the file and wire formats they read or write.

The cases are copied and adapted from the consumers' existing tests that exercise kogen-executor, and they use synthetic fixtures only. The suite runs in this module's ordinary fast check (`go test ./...`), so an interface change fails here first. An intended interface change then edits `contract/` together with paired consumer items.

Boundaries:
- Synthetic fixtures only: no model runs, no network, no download of the real Claude Code runtime.
- No new CLI commands or flags, no new options, and no raised timeouts.
- No production code changes: `executor`, `executor/claudecode`, `executor/conformance`, `agent`, `thinking`, `testproc` and `internal/golden` stay byte-identical. `go.mod` and `go.sum` stay unchanged.
- The suite never imports or reads the consumer repositories at test time. Where a consumer case needs a consumer fixture, the producer owns a copied synthetic version of it.
- Delivery's landing scripts live outside this repository and are not changed here. Dropping the consumer-suite runs from landing is delivery's follow-up.
- Nothing existing is removed. The existing tests stay. The contract suite may overlap with them: the contract suite records what consumers depend on, and the existing tests record this module's own behaviour.
- `features/steps/contract_suite_controls/` holds the shaping observer controls for the acceptance steps. The Build leaves those files unchanged.

Implementation contract.

Package and files:
- New directory `contract/` holds only `_test.go` files in the external test package `contract_test`, plus optional synthetic fixtures under `contract/testdata/`. It has no non-test Go file.
- It imports only this module's packages, `kogen-loop` packages already in `go.mod`, and the standard library.
- One of its test files blank-imports `github.com/KogenAI/kogen-executor/internal/golden`. That follows the module rule that every package with tests accepts `-update`, so `go test ./... -update` keeps working.
- A package comment, in one of the test files, says:
  - what the suite pins;
  - that its cases are copied and adapted from the consumers' tests;
  - that an intended interface change edits `contract/` in the same change and names the paired consumer items.

How the tests are written:
- Independent tests call `t.Parallel()`. The whole package runs in well under 60 s; a few seconds is expected.
- Tests that start the Claude Code adapter use a fake `claude` placed at `claudecode.RuntimePath(home)` under a temporary home, so `Start` installs nothing. The fake is a POSIX `sh` script written by the test, like kogen-build's `fakeClaudeScript`.
  - It answers `--version` with `2.1.312 (Claude Code)`.
  - It answers `auth status --json` with `{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max"}`.
  - For a round, it saves its stdin (the prompt) and prints stream-json lines: `system`/`init`, then optional `assistant` tool_use and `user` tool_result lines with `tool_result_meta`, then `result`.
  - Its `system`/`init` line carries `cwd` (the physical checkout), `session_id` (the `--session-id` argument), `mcp_servers: []`, `permissionMode: "acceptEdits"`, `apiKeySource: "none"` and `claude_code_version`.
  - The adapter tests run on the platforms `claudecode.Supported()` accepts. Elsewhere they skip with `claudecode.UnsupportedMessage(runtime.GOOS, runtime.GOARCH)`.
- Tests assert observable values: return values, errors' `sys.Error` class and reason, emitted run-log event fields, bytes written to the fake's stdin, hook stdout, stderr and exit codes, and files. They never assert source text or unexported identifiers. A change that is not an interface change, such as a comment edit or an equivalent constant expression, keeps the suite green.
- Every assertion message names the contract item and the consumer it comes from, for example `executor_tool.denied (kogen-shaping shape/external.go inspectedBy)`.

What the suite pins:

Sources: the consumer repositories at kogen `9bf6073`, kogen-shaping `c7ba24b` and kogen-build `65f9d77`.

1. `executor` (all three consumers):
   - The constant values:
     - `Contract == "kogen.executor/v2"`, `Native == "native"`, `ClaudeCode == "claude-code"`;
     - the roles `shape`, `build` and `review`;
     - `ResumeExact == "exact"` and `ResumeNone == "none"`;
     - the usage sources `provider` and `harness`;
     - the usage states `complete`, `partial` and `unknown`;
     - `PreventWriteTool == "write_tool_refusal"` and `PreventPreToolWrite == "pretool_hook_write_edit"`;
     - the endings `finish`, `no_call` and `blocker`;
     - the reasons `unavailable`, `auth_refused`, `failed`, `usage_limit`, `protocol`, `deadline` and `interrupted`.
   - `Fail(reason, detail)` returns a `*sys.Error` with class `executor`, that reason, that detail and exit 1. Consumers match class `executor` with a reason: kogen-build `builder.go`, `executor_external.go` and `lineup_test.go`; kogen `cli/executor_wiring_test.go`.
   - `RoundLimit(n)` has class `candidate`, reason `executor_round_limit`, and a detail that names `n` rounds. Consumers show `candidate/executor_round_limit`: kogen-build `executor_test.go` and `k19_no_progress_test.go`.
   - `Descriptor.For`:
     - It returns `RoleCapabilities` entries as they are.
     - A descriptor without `RoleCapabilities`, whose `Capabilities.Roles` lists `build`, serves Build with the aggregate capabilities copied, including `MaxRounds`, and serves no other role. That is kogen-build's native descriptor.
     - `ValidateRole` refuses another contract id and an unserved role, with `executor/unavailable`.
   - The type and field names consumers construct and read compile: `Task`, `Brief`, `Input`, `RoundResult`, `Usage`, `Handle`, `BlockerClaim`, `Capabilities`, `RoleCapabilities`, `Descriptor`.
   - The interfaces `Executor`, `Session`, `PromptSizer` and `Sink` exist, and a consumer-style fake executor satisfies `Executor` (kogen-build `executor_test.go`).
2. `executor/claudecode` (kogen `cli`, kogen feature drivers, kogen-build tests):
   - Runtime layout:
     - `Version == "2.1.312"`;
     - `Root(h) == h/.kogen/claude-code`, `RuntimeDir(h) == Root(h)/2.1.312`, `RuntimePath(h) == RuntimeDir(h)/claude` and `ConfigDir(h) == Root(h)/config`;
     - `Pinned` accepts `2.1.312 (Claude Code)` and refuses `2.1.300 (Claude Code)`;
     - the exact texts of `NotPinnedMessage` and `UnsupportedMessage`;
     - `SeamEnv == "KOGEN_CLAUDE_CODE_URL"`;
     - `Probe(ctx, home, "--version")` runs the installed fake and returns its answer.
     Sources: kogen `cli/claude_runtime_test.go`, `cli/readiness/readiness_test.go` and `cli/native.go`.
   - `Describe()` of `New(Options{Home, HookCommand: []string{"/bin/true"}})` on the fake:
     - `Name` is `claude-code`, `Contract` is `kogen.executor/v2` and `Version` is `claude-code 2.1.312 (Claude Code)`.
     - The aggregate `Capabilities`: Roles `[build]`, Resume `none`, Continuation true, Usage `harness`, Prevention `[pretool_hook_write_edit]`, Blocker true, MaxRounds 6.
     - `For` serves `shape`, `build` and `review`; Blocker is true for build only; Structured is true for shape and review.
     Source: kogen `features/steps/k16_cc_builder_blocker_driver.go`.
   - The hook (kogen `cli/executor_hook_test.go`):
     - `HookSubcommand == "__kogen_executor_hook"`.
     - `RunHook([pretool --policy F], …)` reads a policy file written as raw JSON `{"root","protected","log","nonce"}` and the hook input `{"cwd","tool_name":"Write","tool_use_id","tool_input":{"file_path"}}`.
     - For a protected path it exits 0 and prints exactly one line of JSON `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":…}}`, with a reason that contains `protected path`, and nothing on stderr.
     - For an unprotected path it exits 0 and prints nothing.
     - An unreadable policy, or a malformed argument list, exits 2 with nothing on stdout.
   - Rounds through `Start` and `Round` with the fake:
     - The first prompt on stdin is exactly `<role constraints> + "\n\n" + Brief.Stable + "\n\n" + Brief.Dynamic`, with `Constraints`, `ShapeConstraints` and `ReviewConstraints` for build, shape and review. `New(...)` implements `executor.PromptSizer`, and `FirstPromptBytes(role, brief)` equals the length of that prompt. Sources: kogen `features/steps/k_review_source_bound_driver.go`; kogen-build `context_external_test.go` and `review_parts.go`.
     - A Build success result gives `EndFinish` with `Claim` = the result text.
     - A Build structured `blocker` gives `EndBlocker` with its `paths`, `reason` and `evidence` (kogen `features/steps/k16_cc_builder_blocker_driver.go`).
     - A Shape or Review success gives `RoundResult.Structured` = the result's `structured_output` object, compared semantically (kogen-shaping `shape/external.go`; kogen-build `review_external.go`).
     - Result `usage` maps to `Usage{Input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens, Cached = cache_read_input_tokens, Output = output_tokens, State "complete", Source "harness"}`.
     - An `assistant` line with `"error":"rate_limit"`, followed by a result with `subtype` `success`, `is_error` true and `terminal_reason` `api_error`, fails the round with `executor/usage_limit` (kogen `cli/usage_limit_installed_test.go`; kogen-build `builder.go`).
     - An init line whose `apiKeySource` is not `none` fails with `executor/auth_refused`.
     - Run-log events through the `Sink`:
       - a completed `Read` tool call emits `{"event":"executor_tool","name":"Read","tool_use_id":…,"denied":false}` (kogen-shaping `shape/external.go` `inspectedBy`; kogen `features/steps/k_hook_prevalidation_driver.go`);
       - a failed round emits `executor_round_failed` with `reason` and `detail`;
       - `executor_started` carries `executor`, `contract`, `role`, `model` and `session_id`.
3. `executor/conformance` (kogen-build `executor_native_test.go`, kogen `features/steps/k12_adapter_driver.go`):
   - `ProtectedPath == "protected/contract.txt"`, `ProtectedContent == "approved contract\n"` and `ChildPIDPath == ".conformance/child.pid"`.
   - `NewCheckout(t)` returns a physical path to a Git checkout with one commit, a clean status and `ProtectedPath` holding `ProtectedContent`.
   - `Scripts()` loads without error, and the `Script`, `RoundScript`, `Action`, `WriteAction`, `ScriptUsage` and `Driver` names consumers use compile.
4. `agent` (kogen-build, kogen-shaping, kogen `cli`):
   - The tool-name constant values: `probe`, `finish`, `report_blocker`, `propose_files`, `submit`, `submit_review`, `submit_refinement`, `submit_configuration`, `shape_batch` and `worker_result`. `Defs(name)` returns one definition whose name is that name, and `AsAny` flattens definitions.
   - The prompt-name constant values. `Prompt(n)` is non-empty for each name in `Names()`. `Prompt(Reviewer)` contains `"\n" + LimitRaises + "\n"` exactly once (kogen-build `review_lineup_test.go` and `review_parts.go`).
   - `WithOriginHint`:
     - It appends `OriginRelogin`, whose text is `log in again for that origin with: kogen provider login openai-compatible`, to a `provider/refused` error whose detail contains ` key belongs to `.
     - It leaves any other error unchanged (kogen `cli/compatible_login_test.go`).
   - `BuildReviewBudget == 10 * time.Minute`. `BudgetEvent` returns `{"event":"response_budget","budget_ms":…,"budget":…}`. `NameBudgetExpiry` renames ` response wait exceeded 10m0s` to `10 minutes` (kogen `cli/response_budget_test.go`).
5. `thinking.Strip` (kogen-build `k18_binding_test.go` and `context.go`; kogen-shaping `shape/window.go`):
   - It removes `thinking` and `redacted_thinking` blocks.
   - A message left without blocks loses `anthropic_message` and keeps its plain `content`.
   - Other items stay as they are, and the input is not mutated.
6. `testproc.Isolate` (kogen-build `baseline_cache_test.go`; kogen-shaping `shape/helper_test.go`): in the child it applies the given `KEY=value` environment for the test and returns true. The parent returns false after the child passed.

README:

`README.md`'s Testing section gains a subsection with the heading line `### Contract suite`. It says:
- `contract/` pins the API, behaviours and file and wire formats that kogen, kogen-shaping and kogen-build use from this module, copied from their tests with synthetic fixtures;
- it runs in the ordinary `go test ./...`, and `go test ./contract/...` runs it alone;
- an intended interface change edits `contract/` in the same change, together with its paired consumer items in those repositories;
- a contract failure that is not an intended change is a break to fix in kogen-executor.

## Decisions
- The suite lives in `contract/` in kogen-executor and runs as part of its own fast gate (`go test ./...`) (source: request)
- The suite pins the exported API, behaviours and file and wire formats that kogen, kogen-shaping and kogen-build use, derived by copying and adapting the consumers' existing tests (source: request)
- Synthetic fixtures only; no model runs; no network; no new CLI commands or flags; no raised timeouts (source: request)
- No dependency on the consumer repositories at test time; the producer owns the copied cases (source: request)
- An intended interface change edits the contract together with paired consumer items (source: request)

## Source comparison
- Request "Today a kogen-executor landing runs the offline suites of its consumers": the motivation. Landing scripts are outside this repository. Removing those runs is delivery's follow-up and is not part of this change.
- Request "contract/ suite ... pins exactly what its consumers use: the exported API ..., the behaviours ..., the file and wire formats": What the suite pins (items 1–6, in the Implementation contract).
  - Exported API: constants, types, interfaces and functions; the `PromptSizer` rename scenario.
  - Behaviours: errors, `Descriptor.For`, rounds, `thinking.Strip`, `WithOriginHint`; scenarios 5–7 and 14–17.
  - File and wire formats: runtime layout, hook policy file, hook stdin and stdout, stream-json, first-prompt bytes, run-log events; scenarios 9–13.
- Request "Derive the cases from the consumers' existing tests ... copy and adapt ... synthetic fixtures only": each item names its consumer source at the pinned commits. The fake `claude` is a copied, adapted sh fake. Scenario 2 shows that no consumer module is a test-time dependency.
- Request "runs as part of kogen-executor's own fast gate, so an interface change fails in kogen-executor first": scenario 1 (in `go list ./...`, ok in under 60 s, accepts `-update`); scenarios 5–17 (one break each fails `./contract/...`); scenario 4 (a non-interface change stays green).
- Request "An intended interface change then edits this contract together with paired consumer items": the README subsection and the package comment; scenario 3.
- Request constraints "no model runs; no network; no new CLI commands or flags; no timeout raised; keep the suite fast": Boundaries; scenario 1's time bound. The acceptance step limits exist only in the acceptance harness.
- Omitted: the consumers' end-to-end Build, Shape and Review flows. Those flows are consumer behaviour, not kogen-executor's interface.

## Tests
- `contract/` is a package of the module's ordinary `go test ./...`, passes on the unchanged tree in under 60 s and accepts `-update`: acceptance scenario 1 (scenario)
- The suite has no test-time dependency on kogen, kogen-shaping or kogen-build: acceptance scenario 2 (integration)
- The README documents the suite and the paired-change rule: acceptance scenario 3 (scenario)
- A change that is not an interface change keeps the suite green: acceptance scenario 4 (scenario)
- Each consumer-relied interface point fails the suite when broken: acceptance scenarios 5–17. They cover the error class, the round-limit stop, the `Descriptor.For` Build fallback, the `PromptSizer` name, the runtime layout, the hook deny answer, the hook policy file format, the first-prompt layout, the `executor_tool` event, the usage-limit classification, the structured submission, `thinking.Strip` and `WithOriginHint` (scenario)
- Every item of What the suite pins (1–6) is asserted by a test in `contract/`: new pure-value checks (unit), and adapter, hook, checkout and testproc checks through processes and files (integration)
- Existing behaviour of every package is unchanged: the existing tests pass unchanged (existing)

## Feasibility
- A directory with only `_test.go` files works under `go build ./...`, `go vet ./...` and `go test ./contract/...`, and `go list ./...` lists it. (local observation in a scratch copy)
- On the unchanged tree, `go test -count=1 ./contract/...` fails with `FAIL ./contract/... [setup failed]` and `go list -deps -test ./contract/...` fails, so all 17 scenarios fail now. (local cucumber run: 17 scenarios, 17 failed)
- A minimal known-good contract test (`features/steps/contract_suite_controls/good_test.go.txt`) runs the Claude Code adapter on an sh fake `claude` with no network. It passes in about 3 s, and it catches each of the 13 breaks. Each break leaves `go build ./...` passing. (local observation in scratch copies)
- evidence: {"id":"contract-acceptance-observer","kind":"observer","inputs":["features/steps/contract_suite_controls/observe.sh","features/steps/contract_suite_controls/good_test.go.txt","features/steps/contract_suite_controls/bad_test.go.txt","features/steps/contract_suite_controls/readme_section.md"],"observers":["features/steps/contract_suite_steps.js","features/steps/golden_update_steps.js",".kogen/intents/k-contracts-executor/acceptance.feature"],"checks":[{"name":"good","command":"sh features/steps/contract_suite_controls/observe.sh good","exit":0,"output":"17 scenarios (17 passed)\n"},{"name":"bad","command":"sh features/steps/contract_suite_controls/observe.sh bad","exit":1,"output":"failed: An interface break in thinking.Strip fails the contract suite\n17 scenarios (16 passed, 1 not passed)\n"}]}
