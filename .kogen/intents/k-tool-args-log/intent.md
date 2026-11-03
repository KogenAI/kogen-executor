# Keep redacted tool arguments in run-log records

Slug: k-tool-args-log
Model: not applicable — each record's arguments are a pure function of one tool_use input and the adapter's fixed options; no state carries across calls or rounds
Acceptance:
- .kogen/intents/k-tool-args-log/acceptance.feature
- features/steps/k_tool_args_log.js
- features/steps/k_tool_args_log/main.go

The Claude Code adapter (`executor/claudecode`) emits one `executor_tool` event per finished tool call through the task's `executor.Sink`. Kogen writes those events into the run log (`.kogen/local/runs/<id>/log.jsonl`; Shape writes them into its local shaping events). Today a record has only `event`, `round`, `name`, `tool_use_id`, `denied` and sometimes `rejected_before_hook`: no command, path or edit body. After this change every `executor_tool` event also carries an `arguments` value. It is the call's tool_use `input` with secrets redacted and size bounded, computed in the adapter before the event reaches the Sink. A researcher can then tell edits from verification, and repeated or independent commands apart, from the run log alone. All existing fields, event names, event order and other events (`executor_hook`, `executor_round_*`, `executor_started`) stay as they are. The log stays where it is today; there is no new destination, CLI command, flag, option, setting or timeout.

Boundaries:
- The raw round stream (`round-N.jsonl`), round stderr and hook log in the private task directory are not changed. They keep their existing stored-token redaction only.
- The native Loop Build `tool_call` records keep their `{sha256, bytes}` argument fingerprints, and kogen-loop's `tool.call` keeps `arguments_sha256`. Both are written by kogen-build and kogen-loop, not by this repository; they are a follow-up there and are not claimed fixed here.
- The redaction rules below are a defined list of known secret forms. They do not claim to detect every possible credential.

## Rules

1. Field. All four existing `executor_tool` emission paths in `executor/claudecode/stream.go` add the key `arguments`: the Shape configuration denial, `rejected_before_hook`, the hook-checked guarded call and every other call. Its value is the processed `input` of the same `tool_use_id`, taken from the tool_use line after the existing whole-line stored-token redaction. When the tool_use has no `input`, or `input` is not a JSON object, `arguments` is JSON `null`. Processing keeps object keys unchanged, keeps array order, keeps booleans and null, and keeps numbers as their exact JSON number text (the stream is already decoded with `UseNumber`).
2. Redaction. The replacement text is the existing `[redacted]` mark. It applies to every string value at any depth, not to object keys. Steps run in this order:
   a. Stored token: the existing whole-line redaction of `Options.Token`, unchanged.
   b. Environment values: take every `NAME=VALUE` entry of the adapter's base environment (`Options.Env`, which defaults to `os.Environ()`, before the child strip list) whose NAME is secret-named and whose VALUE is at least 8 bytes. Every occurrence of such a VALUE is replaced, longest values first.
   c. Private key blocks: `-----BEGIN` + optional uppercase letters, digits and spaces + `PRIVATE KEY-----`, through the next `-----END …PRIVATE KEY-----`. If there is no END marker, the block runs to the end of the string. The whole block is replaced.
   d. URL passwords: in `scheme://user:password@`, the password is replaced and `scheme://user:` and `@` stay.
   e. Authorization headers: case-insensitive `Authorization:`, optional whitespace, a scheme word (letters), whitespace, then the credential, a run of characters other than whitespace and quotes. Only the credential is replaced.
   f. Token formats, starting at a word boundary, each replaced whole:
      - `ghp_`, `gho_`, `ghu_`, `ghs_` or `ghr_` followed by letters and digits;
      - `github_pat_` followed by letters, digits and `_`;
      - `sk-` followed by at least 20 letters, digits, `_` or `-`;
      - `AKIA` or `ASIA` followed by exactly 16 uppercase letters or digits, ending at a word boundary;
      - `xoxa-`, `xoxb-`, `xoxp-`, `xoxr-` or `xoxs-` followed by letters, digits and `-`.
   g. Secret-named assignments, `NAME=VALUE`: NAME is the maximal run of letters, digits, `_` and `-` directly before `=`. This covers `GITHUB_TOKEN=x cmd`, `export X='…'`, `--api-key=x` and `?password=x&…`. VALUE is a single-quoted string, a double-quoted string, or a run of characters other than whitespace, quotes, backtick and `;&|()<>`. VALUE, with its quotes, becomes `[redacted]`; `NAME=` stays.
   h. Secret-named options with a separate value: `-NAME` or `--NAME` at the start of the string or after whitespace, then whitespace, then a value that does not start with `-`, in the same value forms as (g). The value is replaced.
   A NAME is secret-named when, after removing leading `-`, replacing `-` with `_` and uppercasing, it contains one of `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `PASSPHRASE`, `API_KEY`, `APIKEY`, `ACCESS_KEY`, `PRIVATE_KEY` or `CREDENTIAL`. For example, `GIT_AUTHOR_NAME=Ana`, `-count=1` and `--short` are not secret-named and stay verbatim.
3. String bound. This runs after redaction (redaction always wins over truncation). A string of at most 4096 bytes is kept. A longer string is replaced by the object `{"truncated": true, "bytes": <byte length of the redacted string>, "sha256": "<lowercase hex SHA-256 of the redacted string>", "head": "<its first 256 bytes, cut back to a UTF-8 rune start>"}`. Example: 5000 `z` followed by `\nAPI_TOKEN=bigFAKEsecret77\n` becomes `bytes` 5022 with the hash of the redacted text and `head` of 256 `z`. 1500 `€` (4500 bytes) gets a `head` of 85 `€` (255 bytes).
4. Whole bound. When the `encoding/json` `Marshal` of the processed arguments is over 65536 bytes, `arguments` becomes `{"truncated": true, "bytes": <length of that encoding>, "sha256": "<lowercase hex SHA-256 of that encoding>"}`. An encoding of exactly 65536 bytes is kept.

The Build must keep the public API that the protected driver uses compiling unchanged: `claudecode.New`, `Options` (Home, HookCommand, Env, Token, KillGrace), `RuntimeDir`, `RuntimePath`, `Version`, `RunHook`, and the `executor` Task, Brief, Input and Session types. Existing unit tests build `roundRun`/`session` values without an adapter (for example `preHookRun` in `adapter_test.go`), so they must keep passing: either the code tolerates that, or those helpers are updated without weakening their assertions.

Acceptance driver (protected): `features/steps/k_tool_args_log/main.go` is a `package main` built by the step file with `go build -o <tmp>/driver ./features/steps/k_tool_args_log`. `driver run <role> <calls.json> [token-file]` creates a temporary checkout containing `app.txt` (`before\n`), symlinks itself as the pinned runtime, and runs one real `claudecode` round with:
- `HookCommand` `[driver, hook]`, dispatched to `claudecode.RunHook`;
- `Env` set to its own environment plus `K_TOOL_ARGS_CALLS` and `K_TOOL_ARGS_ROLE`;
- the optional stored token read from the token file.

Its fake runtime answers `--version` and `auth status` locally and reads the prompt. It then emits init, a tool_use (`toolu_<n>`) and a tool_result for each scripted call, and a success result (a `structured_output` object for Shape and Review). Guarded calls outside Shape run the real PreToolUse hook from `--settings`; Shape's guarded calls are refused without a hook. The driver prints every emitted event as one JSON line. The step spawns it with only `PATH`, `TMPDIR` and the scenario's variables, so the adapter's base environment is the fixture's own. `driver control-good` and `driver control-bad` qualify the scripted transport (see Feasibility). No model call is made.

## Decisions
- Run-log tool-call records keep the call's arguments (command, paths, edit sizes), so turn waste and stage attribution can be measured from the run log alone. In this repository that means every Claude Code `executor_tool` record gains `arguments`. (source: request)
- Credentials, tokens and the environment values that hold them are redacted before the record is written; a regression test proves a known secret pattern in a command is redacted. (source: request)
- Very large arguments (file bodies) are truncated, keeping their size and hash; strings over 4096 bytes keep a 256-byte head, and an encoding over 65536 bytes keeps only its size and hash. (source: request)
- The log stays local, as today; no new CLI command, flag or setting; no timeout raised; synthetic tests only, with no model runs. (source: request)

## Source comparison
- Addressed: Problem/Need. Run-log tool-call records record no command or file arguments. See Rule 1 and the verbatim scenarios for Bash, Read, Grep, Edit and Write in the shape, build and review roles.
- Addressed: "Secrets never reach the log … a regression test proves a known secret pattern in a command is redacted". See Rule 2, the secret-pattern scenario outline (each pattern row also checks that no run-log event contains the secret), the private-key and redaction-before-truncation checks, and the Go regression test in Tests.
- Addressed: "Bounded size: very large arguments (file bodies) may be truncated with their size and hash kept". See Rules 3–4 and the 4096/4097-byte, rune-boundary and 65536/65537-byte scenarios.
- Addressed: constraints. There is no new CLI command, flag or option and no timeout change. Acceptance uses a scripted fake runtime with no model, and the records go only to the existing Sink.
- Reproduction: the request compares a run-log record with a standalone Loop `tool-items.jsonl`, using research's private notes (`notes-harness/loopclimb/reqcnt.md`, `lrepin.md`, `turns.md`). Those notes are not in this repository. Acceptance reproduces the gap directly: the record for a scripted call must carry that call's input.
- Omitted by repository split: native Loop Build records (kogen-build `tool_call` with `arguments` fingerprint; kogen-loop `tool.call` with `arguments_sha256`). They are a follow-up in those repositories, not claimed here.
- Unchanged: stage attribution context. Role and round are already in `executor_started` and `executor_round_started`, and `round` is in each record. Raw round stream and hook log contents are also unchanged.

## Tests
- Every executor_tool record carries `arguments` equal to its tool_use input (ordinary values verbatim, numbers exact), in Shape, Build and Review, for allowed, hook-denied and Shape-refused calls: acceptance scenarios through the real adapter round with the scripted runtime (integration).
- `arguments` on the rejected_before_hook path, and null for a tool_use without an object `input`: add focused Go tests next to `TestRejectedBeforeHookContinues` using its existing `preHookRun` style (unit).
- Each redaction rule, including stored token, environment value of 8 bytes redacted versus 7 bytes kept, `sk-` with 20 characters redacted versus 19 kept, and `AKIA` with 16 characters redacted versus 15 kept: acceptance outline and verbatim scenario (integration). Also add a Go regression test in `executor/claudecode` that feeds a Bash tool_use whose command contains `GITHUB_TOKEN=<value>` and a `ghp_` token, and asserts the emitted record's command holds `[redacted]` and neither value (regression).
- String bound at 4096/4097 bytes, rune-boundary head, and redaction before truncation: acceptance Shape scenario plus a focused Go test of the bound (unit).
- Whole bound at 65536/65537 encoded bytes: acceptance scenario (integration).
- Existing hook, liveness, redaction, conformance and lifecycle behavior is unchanged: the existing `executor/claudecode` and `executor/conformance` tests and the k-exec-kill acceptance keep passing (existing).
- All configured checks stay passing without weakening: format, compile, vet, go-test and the acceptance command (integration).

## Feasibility
- Observed in this shaping session's own scratch copy outside the checkout (not Kogen-retained probe records):
  - The drafted driver builds, is gofmt-clean and passes `go vet ./...`, together with the existing `k_exec_kill_driver.go`.
  - `driver control-good` printed `PASS: round accepted with 1 tool record` and exited 0. `driver control-bad` (init reporting an API-key credential source) printed `FAIL: round refused` and exited 1.
  - On the unchanged tree, all 21 scenarios ran and failed only at the arguments assertions, with no skipped or undefined steps.
  - A throwaway scratch implementation of Rules 1–4 passed all 21 scenarios. With it, `go test ./executor/...` passed once it tolerated the adapter-less test sessions. The scratch implementation is not part of this contract.
- Digests in the feature were computed with Python `hashlib` over the exact bytes; the 65536/65537 encodings were measured with compact JSON, matching Go `json.Marshal` for these ASCII-only values.
- No external documentation lookup was needed: the rules use only Go's standard `regexp` (RE2, no lookbehind needed), `encoding/json` and `crypto/sha256`.
- evidence: {"id":"transport-observer","kind":"observer","inputs":["features/steps/k_tool_args_log/main.go"],"observers":["features/steps/k_tool_args_log/main.go"],"checks":[{"name":"good","command":"d=$(mktemp -d); trap 'rm -rf \"$d\"' EXIT; go build -o \"$d/driver\" ./features/steps/k_tool_args_log && \"$d/driver\" control-good","exit":0,"output":"PASS: round accepted with 1 tool record\n"},{"name":"bad","command":"d=$(mktemp -d); trap 'rm -rf \"$d\"' EXIT; go build -o \"$d/driver\" ./features/steps/k_tool_args_log && \"$d/driver\" control-bad","exit":1,"output":"FAIL: round refused\n"}]}
