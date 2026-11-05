# Match protected paths across Unicode normalization

Slug: k-exec-protected-unicode-normalization
Model: not applicable — the pretool decision stays a stateless function of the policy, the call and the file system; only the path-component equality changes
Acceptance:
- .kogen/intents/k-exec-protected-unicode-normalization/acceptance.feature
- features/steps/k-exec-protected-unicode-normalization__steps.js

The Claude Code adapter's pretool hook (`RunHook pretool` → `decide` in `executor/claudecode/hook.go`) compares path components with `strings.EqualFold` in `relUnder` (used by `within`) and in `hasGitComponent`. On file systems that treat canonically equivalent Unicode names as one file (the usual macOS volume), a protected entry spelled in one normalization form (`café.txt` with `é` as the single code point U+00E9, NFC) and a call naming it in the other (`cafe` + U+0301 COMBINING ACUTE ACCENT, NFD) are different strings to the hook but the same file to the system, so a Write to the other spelling is allowed today while it changes the protected file.

After this change, two path components are equal when they are equal after Unicode canonical normalization and case folding together: a component pair in which both are pure ASCII (every byte below 0x80) is compared with `strings.EqualFold` exactly as today and is never normalized; any other pair is compared as `strings.EqualFold(norm.NFC.String(a), norm.NFC.String(b))` with `golang.org/x/text/unicode/norm`. This one component equality is used by all three tests of the hook: the protected-entry test (`within(protected entry, target)`), the `.git` component test (`hasGitComponent`) and the checkout-root containment test (`within(root, resolved)` and `relUnder(root, target)`), so they agree. Other users of `within` (the artifact-directory test in `decide` and `Start`'s artifact-directory placement in `claudecode.go`) get the same equality because they share the function; nothing else about them changes.

Dependency: add `golang.org/x/text v0.43.0` as a direct requirement in `go.mod` with its `go.sum` lines (`go get golang.org/x/text@v0.43.0`; it is in the local module cache and resolves without network). No other module is added.

Unchanged: the policy file format (`root`, `protected`, `log`, `nonce`, optional `read_only`, `artifact_dir`, `protected_ids`), the order of the checks and every reason text. A deny reason names the protected entry in its policy spelling (`this is a protected path (<entry>)`, the entry passed through `filepath.ToSlash` as today, not normalized). The sentinel record's `path` stays the resolved path built from the call's own spelling: the hook never writes a normalized form of the path to the log. Resolution of the path (`filepath.Join`, `filepath.Clean`, `resolveReal`) is not changed, and nothing is normalized before resolution. The hard-link identity check is unchanged. Entries and calls that are pure ASCII produce exactly today's answers and hook log records.

Interfaces the acceptance step relies on, which must keep their names and shapes: the exported `claudecode.RunHook(args []string, stdin io.Reader, stdout, stderr io.Writer) int` with `pretool --policy FILE`, the policy JSON keys `root`, `protected`, `log`, `nonce`, the PreToolUse deny JSON on stdout, and the sentinel JSON keys `nonce`, `hook`, `tool_use_id`, `tool_name`, `path` (omitted when empty), `decision`, `reason` (omitted when empty), `time`. The step builds a driver `main` package `kexecprotectedunicodehookdriver` through `go build -overlay` (it does not exist on disk); do not add a package with that name.

## Decisions
- Path components that are canonically equivalent (NFC against NFD) compare equal in the hook, in addition to today's case-insensitive comparison. (source: request)
- The same comparison is used by the protected-entry test, the `.git` component test and the checkout-root containment test. (source: request)
- Components that are pure ASCII on both sides are compared exactly as today, without normalization. (source: request)
- Sentinel records keep the path as the tool call spelled it (resolved as today, never normalized). (source: request)
- Technical choice: case folding and normalization apply together, so `CAFE` + U+0301 `.TXT` matches the protected `café.txt`, as the usual macOS volume (case- and normalization-insensitive) treats them as one file. (source: request)
- Technical choice: normalization uses `golang.org/x/text/unicode/norm` NFC (v0.43.0); NFC and NFD give the same equivalence. (source: request)
- Technical choice: the deny reason keeps the protected entry's policy spelling, unnormalized. (source: request)

## Source comparison
- Problem (an NFC entry and an NFD call, or the reverse, pass the hook): addressed by the component equality above; acceptance scenarios 1 and 2 fail on the unchanged tree (observed: `café.txt` against protected `café.txt` is allowed today).
- Need 1 (canonically equivalent names equal, in addition to case-insensitivity): scenarios 1, 2 and 3, including mixed case with the other form.
- Need 2 (protected entries, `.git` test and checkout-root containment consistent): scenario 4 (protected directory) and scenario 5 (a checkout root `ré` named by an absolute path in NFD: allowed, protected and `.git` denials apply under it; observed today: all three are "outside the checkout").
- Need 3 (ASCII entries and paths behave exactly as today and pay no normalization cost): scenario 6 checks exact answers and log records for ASCII-only fixtures; the no-normalization fast path for pure-ASCII pairs is an implementation rule above (not observable from outside).
- Need 4 (sentinel records keep the call's path): every scenario checks the logged `path` byte-for-byte, e.g. `$T/r/café.txt` for an NFD call.
- Synthetic 1 (protected composed `café.txt`, Write to decomposed: denied, reason names the entry): scenario 1, reason `Kogen: this is a protected path (café.txt)`.
- Synthetic 2 (protected decomposed, call composed: denied): scenario 2.
- Synthetic 3 (`cafe.txt`: allowed): scenarios 1 and 2.
- Synthetic 4 (directory protected as `dép/`, call `dép/file.go`: denied): scenario 4, with the entry composed (`dép/`) and the call in both forms, reason `(dép/)`.
- Synthetic 5 (`.git` unchanged for ASCII input): scenario 6 (`.git/config`, `.GIT/HEAD`, `sub/.git/config` denied; `.github/ci.yml` allowed) and scenario 5 (`.git` under an NFD-spelled root).
- Synthetic 6 (ASCII-only fixtures give the same results and identical hook log records): scenario 6, exact records (all keys besides nonce and time), passing on the unchanged tree as a regression guard.
- "Temporary checkout and the hook run directly": the step writes a policy for a temporary checkout and runs the real `RunHook` entry point in a driver process per call; no special file system is used.
- Omitted: nothing in the request.

## Tests
- An NFD call to an NFC protected file (and the reverse, and mixed case with the other form) is denied naming the entry, and the sentinel keeps the call's spelling: new `TestPreToolUnicodeNormalization` in `executor/claudecode/hook_test.go` using `newHookEnv`, plus acceptance scenarios 1–3 (integration)
- A protected directory matches calls below it in either normalization form; an ASCII look-alike (`dep/`) and a prefix sibling stay allowed: cases in `TestPreToolUnicodeNormalization`, plus scenario 4 (integration)
- The checkout-root containment and `.git` tests use the same equality: a case in `TestPreToolUnicodeNormalization` with a non-ASCII root named in the other form (allowed for an ordinary file, denied for a protected file and under `.git`), plus scenario 5 (integration)
- ASCII-only entries and calls give today's answers and identical hook log records: the existing `TestPreToolDecisions` and `TestPreToolProtectedDirectory` unchanged, plus scenario 6 (regression)

## Feasibility
- `golang.org/x/text v0.43.0` is in the local module cache: `GOPROXY=off go get golang.org/x/text@v0.43.0` in a scratch copy added only that module and its two `go.sum` lines, and `strings.EqualFold(norm.NFC.String("café.txt"), norm.NFC.String("café.txt"))` and `strings.EqualFold(norm.NFC.String("CAFÉ"), "café")` were true while plain `EqualFold` was false. (scratch probe: exit 0)
- The hook driver builds with `go build -overlay` from the unchanged checkout without writing to it (about 1 s warm), and on the unchanged tree the NFD call to protected `café.txt` is allowed and the NFD-spelled root is "outside the checkout", while ASCII answers match scenario 6. (scratch probe: exit 0)
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-protected-unicode-normalization__steps.js"],"observers":["features/steps/k-exec-protected-unicode-normalization__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-protected-unicode-normalization__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-protected-unicode-normalization__steps.js bad","exit":1,"output":"observer bad rejected\n"}]}
