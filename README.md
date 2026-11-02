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

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
