# Record fixture runtime arguments and token

Slug: executor-fixture-records-args-token
Model: not applicable — the change adds two per-round record files and two read accessors to a test fixture, with no lifecycle state of its own
Acceptance:
- .kogen/intents/executor-fixture-records-args-token/acceptance.feature
- features/steps/executor-fixture-records-args-token__steps.js
- features/steps/executor-fixture-records-args-token__probe/args_token_probe_test.go.txt

The shared fake Claude Code runtime of `testkit/clauderuntime` replays rounds but records neither the arguments the adapter passed to the runtime nor the token the adapter wrote on file descriptor 3. Consumers whose own tests assert those (Setup's `consumes/kogen-executor/executor_test.go` checks `--model`, `--effort`, `--json-schema` and that the token arrives on fd 3) cannot adopt the fixture without losing that coverage. This change makes the fake record both and adds accessors to read them. Production code under `executor/`, every existing option, file, constant, line builder and behavior of the fixture, and the pinned-size padding stay as they are.

Interface (the independent probe of the acceptance calls exactly this):
- For round n (the n-th call of the fake that is neither `--version` nor `auth status`, counted as today in `<State>/calls`) the script writes `<State>/args-<n>.txt`: the arguments of that call (without the binary), one per line, each followed by a newline (`printf '%s\n' "$@"`). An argument that contains spaces stays on its one line.
- When file descriptor 3 is open in round n, the script reads it to end of file and writes exactly those bytes to `<State>/token-<n>.bin` (no added or removed byte). When fd 3 is not open, the script writes no `token-<n>.bin`, does not fail and does not wait, and answers the round exactly as before (prompt saved, init line, configured round lines, exit 0). The test for "open" must not itself consume or alter the descriptor and must work in the POSIX `sh` the script already uses.
- `func (f *Fixture) Args(t testing.TB, n int) []string` returns the lines of `<State>/args-<n>.txt` (the final newline removed, so `Args` returns exactly the arguments the round was called with). `func (f *Fixture) Token(t testing.TB, n int) string` returns the content of `<State>/token-<n>.bin`. Each calls `t.Helper()` and, when its file does not exist, fails the test with `t.Fatalf` and a message that names the round as `round <n>` and says what was not recorded (for example "the fake claude read no token on fd 3 for round 2: <error>"), like `Prompt` does for a missing prompt.
- Both files are written by the script during the round, so they are present as soon as the round returned.

Tests first: the Build first adds failing tests to `testkit/clauderuntime/fixture_test.go` — a round run with arguments and a token on fd 3 returns both through `Args` and `Token`; a round run without fd 3 still succeeds and `Token` fails the test (observed through a recording stand-in for `testing.TB`, as `TestInstallRequiresHomeAndState` already does for `Install`) — and only then changes the fixture. It then runs the testkit and contract tests and the full `go build ./... && go vet ./... && go test -race -count=1 ./...` of the README.

## Decisions
- Args are recorded with printf '%s\n' "$@" into <State>/args-<n>.txt and Args splits that file on newlines after dropping the final one, so one line is one argument. (decision: D1, round 1) (constraint: no binary name in the record) (evidence: testkit/clauderuntime/script.go; executor/claudecode/args.go) (assumption: An argument containing a newline is unsupported; the adapter passes none.) (source: request)
- The token is the exact bytes fd 3 delivers, written to token-<n>.bin; the fake reads fd 3 to end of file, one pipe per round as the adapter hands a stored token over. (decision: D2, round 1) (constraint: no trimming and no added newline) (evidence: executor/claudecode/claudecode.go) (source: request)
- Whether fd 3 is open is tested in a subshell redirecting stdin from it with stderr discarded; a round without fd 3 writes no token file and still answers. (decision: D3, round 1) (constraint: a round without fd 3 answers exactly as before and exits 0) (evidence: testkit/clauderuntime/script.go) (assumption: A scratch run in this external session passed under dash; behavior under bash POSIX mode on darwin/arm64 was not observed.) (source: request)
- Accessors Args and Token are methods of *Fixture failing with t.Fatalf and a message naming round <n>, in the form of the existing Prompt; no other exported symbol, option, file name or constant is added. (decision: D4, round 1) (evidence: testkit/clauderuntime/fixture.go; testkit/clauderuntime/script.go) (source: request)
- Pinned-size padding is unchanged; Install still truncates to claudecode.RuntimeSize(). (decision: D5, round 1) (evidence: testkit/clauderuntime/fixture.go) (source: request)
- Nothing under executor/ changes and the contract/ suite needs no change; consumer repositories are not edited. (decision: D6, round 1) (constraint: no change under executor/) (evidence: README.md) (source: request)
- Acceptance observes the behavior through an independent Go probe in a scratch copy (installed fake driven with and without fd 3, plus a real claudecode session with a stored token), calling the accessors by reflection so it runs on a tree lacking them. (decision: D7, round 1) (evidence: executor/claudecode/claudecode.go; executor/claudecode/args.go; testkit/clauderuntime/fixture_test.go) (assumption: The request does not ask for an independent acceptance probe; the user must confirm an extra probe beyond the Build's own tests is acceptable.) (source: request)

## Source comparison
- Addressed: record per round the arguments one per line in `<State>/args-<n>.txt` and the fd 3 bytes in `<State>/token-<n>.bin` when fd 3 is open (scenarios 1 and 3); no token file and an unchanged answer when fd 3 is not open (scenario 2).
- Addressed: `(*Fixture).Args(t, n) []string` and `(*Fixture).Token(t, n) string`, each failing the test with a clear message naming the round when it recorded nothing (scenarios 1 and 2).
- Addressed: every existing option, file, constant, line builder and behavior unchanged and the pinned-size padding working (scenario 4); tests added first in `testkit/clauderuntime/fixture_test.go` for both cases (the Tests list and scenario 5's check that the file calls both accessors); testkit and contract tests with the race detector (scenario 5); no change under `executor/` (scenario 6).
- Addressed by the Build's final verification, not by acceptance: the full `go build ./... && go vet ./... && go test -race -count=1 ./...` run.
- Omitted, not claimed: Setup's `consumes/kogen-executor/executor_test.go` and the refused Shape of setup-consumes-executor-claude-fixture are in another repository and are not available here.

## Tests
- A round run with arguments and a token on fd 3 returns both through `Args` and `Token`, and the files hold one argument per line and the exact token bytes: a new test in `testkit/clauderuntime/fixture_test.go` that runs the installed fake with a pipe on fd 3 (integration)
- A round run without fd 3 still answers, writes no token file and `Token` fails the test with a message naming the round, and `Args` and `Token` fail for a round that never ran: a new test in `testkit/clauderuntime/fixture_test.go` using a recording stand-in for `testing.TB` (integration)
- A real adapter session with a stored token leaves its `--model`, `--effort`, `--json-schema` and the token in the record of every round: the independent probe of the acceptance (scenario)
- The fixture's existing answers, prompt record, round replay and pinned-size padding are unchanged: the existing `testkit/clauderuntime` and `contract/` tests, run with the race detector (existing)
- Production code under `executor/` is unchanged: the full `go build`, `go vet` and `go test -race -count=1 ./...` (existing)

## Feasibility
- none
