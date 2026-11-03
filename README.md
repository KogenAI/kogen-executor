# kogen-executor

Kogen's shared execution and session contracts and its backend adapters.

It is a component of [Kogen](https://github.com/KogenAI/kogen), which pins an exact version of it and assembles the `kogen` program.

## Packages

- `executor`: the external executor contract.
- `executor/claudecode`: the Claude Code adapter (pinned runtime, hooks, sessions, streaming).
- `executor/conformance`: the scripted conformance checks for executors.
- `agent`: the native Kogen Loop agent definitions: tools, prompts and budgets.
- `thinking`: removal of stale thinking blocks from kept provider messages.
- `testproc`: process isolation for tests with process-wide state.

## Testing

Then run:

```sh
go build ./... && go vet ./... && go test -race -count=1 ./...
```

The module depends on private KogenAI modules: set `GOPRIVATE=github.com/KogenAI/*`.

### Updating the golden files

Two tests compare with recorded goldens: `agent/testdata/defs_golden.json` (the Kogen-owned tool definitions) and `agent/testdata/prompts_golden.json` (the byte count and SHA-256 of each prompt). A plain run fails on any drift and writes nothing. The test-only flag `-update` rewrites both from the current output:

```sh
go test ./... -update
```

The flag exists only in test binaries; the `kogen` program has no such option.

Use it only after an intended change to the prompts or to the Kogen-owned tool definitions changes a golden, or to resolve a merge or cherry-pick conflict in a golden by regenerating it on the combined tree. Never use it to make an unexplained failure pass.

Review the diff of the regenerated golden: a change to `prompts_golden.json` must be deliberate, because it records the prompt bytes Kogen's models have always received. Then run the full checks again without the flag.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
