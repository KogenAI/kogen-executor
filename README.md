# kogen-executor

Kogen's shared execution and session contracts and its backend adapters.

It is a component of [Kogen](https://github.com/KogenAI/kogen), which pins an exact version of it and assembles the `kogen` program.

## Packages

- `executor`: the external executor contract.
- `executor/claudecode`: the Claude Code adapter (pinned runtime, hooks, sessions, streaming). Every role's structured submission schema is its phase's own and comes with the task (`executor.Task.Schema`); the adapter passes it on as `--json-schema` and reads only the executor contract's blocker claim from a Build's result.
- `executor/conformance`: the scripted conformance checks for executors.
- `agent`: what the phases share for their model conversations: the generic tool definitions (from kogen-loop), the template mechanism a phase renders its own prompts with, the shared testing rules, and the request budgets. Each phase owns its own prompt and submission tools: kogen-shaping (Shape, Refine), kogen-setup (Init), kogen-build (the builder) and kogen-review (the reviewer).
- `thinking`: removal of stale thinking blocks from kept provider messages.
- `testproc`: process isolation for tests with process-wide state.
- `core`: what kogen-build and kogen-review share: token totals, the review record, an external executor's state and usage and the small encodings both write. The persisted Build state and the run record are kogen-build's; the review's contract and its material are kogen-review's.

## Decoding JSON for display

Consumer callers that pass decoded JSON values to `core.Display` should use
`core.DecodeJSON(data, &target)`. It decodes one complete JSON value and retains
numbers in interface-valued positions as `json.Number`, including in nested
maps and arrays, so their JSON text is preserved for display. Ordinary
`encoding/json.Unmarshal` still decodes interface numbers as `float64`;
`core.Display` retains its float interpolation behavior for those values.

## Claude Code configuration

Kogen uses `~/.kogen/claude-code/config` for its Claude Code configuration.
A plain config directory is created or tightened to permissions `0700`. The config
path may instead be a symlink to an existing directory; Kogen uses it without
changing the target's permissions. You are responsible for securing the target
and its contents appropriately.

See the [environment configuration policy](docs/configuration.md) and the
[executor environment contract](docs/executor-contract.md) for inherited variables.

## Public setup

Install Go 1.27.2, then clone and download the public dependencies:

```sh
git clone https://github.com/KogenAI/kogen-executor
cd kogen-executor
go mod download
```

For inquiries, contact contact@kogen.dev.

## Testing

Run:

```sh
go build ./... && go vet ./... && go test -race -count=1 ./...
```

### Updating the golden files

`agent/testdata/prompts_golden.json` records the byte count and SHA-256 of each shared prompt (the testing rules); the phases' own prompts and tool definitions are recorded by the phases that own them. `contract/testdata/loop_knobs_golden.json` records complete serialized generic-agent request bodies rendered for Responses, Messages and Chat Completions. Phase-owned tools are outside these snapshots. A plain run fails on any drift and writes nothing. The test-only flag `-update` rewrites the goldens from the current output:

```sh
go test ./... -update
```

The flag exists only in test binaries; the `kogen` program has no such option.

Use it only after an intended change to a shared prompt or generic-tool request changes its golden, or to resolve a merge or cherry-pick conflict in a golden by regenerating it on the combined tree. Never use it to make an unexplained failure pass.

Review the diff of the regenerated golden: a change to `prompts_golden.json` must be deliberate, because it records the prompt bytes Kogen's models have always received. Changes to `loop_knobs_golden.json` must likewise be deliberate: review the complete request body diffs alongside the paired consumer items `cli/research_removal_test.go` and `cli/testdata/loop_knobs_golden.json` in kogen. Then run the full checks again without the flag.

### Contract suite

`contract/` pins the API, behaviours and file and wire formats that kogen, kogen-shaping, kogen-setup, kogen-build and kogen-review use from this module. Its cases are copied from their tests and run on synthetic fixtures only: a fake `claude`, temporary checkouts, no model runs and no network.

It runs in the ordinary `go test ./...`, and `go test ./contract/...` runs it alone.

An intended interface change edits `contract/` in the same change, together with its paired consumer items in those repositories: the consumer tests named in the assertion messages. A contract failure that is not an intended change is a break to fix in kogen-executor.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
