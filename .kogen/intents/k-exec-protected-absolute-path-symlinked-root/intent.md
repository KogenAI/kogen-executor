# Keep absolute protected paths via symlinked roots

Slug: k-exec-protected-absolute-path-symlinked-root
Model: not applicable — stateless classification of Start's protected inputs; no new state or interacting rules
Acceptance:
- .kogen/intents/k-exec-protected-absolute-path-symlinked-root/acceptance.feature
- features/steps/k-exec-protected-absolute-path-symlinked-root__steps.js

Claude Code Start (`executor/claudecode`, `New(opts).Start`) resolves the task root with `filepath.EvalSymlinks` and then classifies `Task.Protected` in `classifyProtected` (`executor/claudecode/claudecode.go`). Today an absolute entry is only compared lexically with the resolved root. If the caller spells the checkout through a symlink (for example `<abs>/link/a/b.txt` where `<abs>/link -> <abs>/real` is the checkout), the entry is dropped as `outside_checkout` and the file gets no hook protection. After this change, an absolute entry is compared with the resolved checkout root after the entry's symlinks are resolved too. An entry that reaches a path inside the checkout through either spelling is kept and becomes the repository-relative policy entry that its relative spelling would produce.

Rules, applied to an absolute entry after the existing `TrimSpace` and `filepath.Clean`:
1. Lexical first (unchanged). If the cleaned entry already lies under the resolved root, or is the root or one of its ancestors, the result is exactly today's: it is kept as its lexical relative path, or Start is refused with `root_or_parent`. Relative entries are never resolved and keep today's handling.
2. Resolution fallback. This replaces today's immediate `outside_checkout` drop for an absolute entry that is lexically outside. Resolve the entry's symlinks with the same semantics as the hook's existing `resolveReal` (`executor/claudecode/hook.go`): the longest existing prefix is resolved and the remaining components are appended, so an entry whose final components do not exist yet is handled. Then:
   - When a leading prefix of the entry resolves to the resolved root, the policy entry is the remainder of the entry after the shortest such prefix, with its components kept as spelled (not resolved), exactly what the relative spelling yields. Example: `<abs>/link/inner/x` gives `inner/x` even though `inner` is a symlink to `c` inside the checkout. An empty remainder is the root and is refused with `root_or_parent`.
   - Otherwise, the fully resolved entry is classified against the resolved root with the existing rules: strictly inside gives its relative path; the root or one of its ancestors is refused with `root_or_parent` (Start fails with `unavailable`, detail `protected path root_or_parent: <original entry>`); anything else is dropped with `outside_checkout`.
3. A dropped or refused entry is still reported with its original text, using the existing bounds (256 bytes per entry, first 20 entries, full count). The policy keeps its input order and duplicates.

Nothing else changes: the policy `root` stays the resolved checkout, the executor_started fields stay the same, and the hook (`RunHook pretool`) needs no change. It already denies both the resolved and the symlinked spelling of a protected policy entry.

## Decisions
- An absolute protected entry that names a file inside the checkout through a symlinked spelling of the checkout path is kept and becomes the same repository-relative entry as its relative spelling (`<abs>/link/a/b.txt` gives `a/b.txt`, for task root `link` or `real`). (source: request)
- An entry whose final components do not exist yet is resolved through its longest existing prefix, with the rest appended (`<abs>/link/not-yet/created.txt` gives `not-yet/created.txt`). (source: request)
- An entry that lies outside the checkout after resolution is still dropped with `outside_checkout`, and the start event lists it. An entry that resolves to the checkout root or its parent is still refused (`<abs>/link` makes Start fail as `unavailable`). (source: request)
- Relative entries, and absolute entries already spelled with the resolved root, produce exactly today's policy. Components below the checkout root keep their spelling and are not resolved, so `<abs>/real/inner/x` stays `inner/x` and `<abs>/real/out/f` stays `out/f`. The symlinked spelling `<abs>/link/inner/x` also yields `inner/x`. (source: request)
- Technical choice: the comparison stays lexical first, and resolution is only a fallback for absolute entries that are lexically outside. The policy entry is the remainder after the shortest entry prefix that resolves to the root, which keeps internal components as spelled. Full resolution of the entry is used only when no prefix resolves to the root (a link into a subdirectory). This keeps every currently accepted entry byte-identical. (source: request)

## Source comparison
- Addressed (Problem): an absolute entry under a symlinked spelling is no longer dropped as outside the checkout, so the same file is protected however its path is spelled. This replaces the purely lexical `filepath.Rel(root, p)` decision in `classifyProtected` for lexically outside absolute entries.
- Addressed (Need 1–4): symlink-resolved comparison, resolution of a not-yet-existing tail, the outside drop with `outside_checkout`, the root/parent refusal, and unchanged relative and resolved-spelling entries map to rules 1–3 and the scenarios below.
- Addressed (Synthetic acceptance 1–5): fake Claude Code Start through the existing package test harness, with a temporary directory holding the checkout at `real/` and a symlink `link -> real/`. Case 1 is the scenario with task root `link`. Case 2 uses task root `real`. Case 3 uses `not-yet/created.txt`. Case 4 is the `outside_checkout` drop outline and the `unavailable` refusal outline, both run for task roots `link` and `real`. Case 5 runs the real `RunHook pretool` on the written policy and expects denial for `<abs>/real/a/b.txt` and `<abs>/link/a/b.txt`, plus an allow control for the unprotected sibling `<abs>/real/a/other.txt`.
- Added for the preservation Need: one scenario with relative, resolved-spelling and symlinked-spelling entries, including the in-checkout symlink `inner -> c` and the outward symlink `out -> <abs>/elsewhere`. It tells the requested behavior apart from a plausible wrong implementation that fully resolves every entry.
- Omitted: nothing in the request. No other Start, hook or event behavior changes.

## Tests
- An absolute entry spelled through a symlinked checkout path is kept as the relative entry, for task roots `link` and `real`: new `classifyProtected` cases using a real temp dir with `real/` and `link -> real` in `executor/claudecode/protected_test.go`, plus the Start scenarios (regression)
- A not-yet-existing tail under the symlinked spelling resolves through its longest existing prefix: `classifyProtected` case `<link>/not-yet/created.txt` gives `not-yet/created.txt` (unit)
- An entry that is outside after resolution is still dropped with `outside_checkout`: `classifyProtected` case for `<abs>/elsewhere/f`, plus the Start outline (unit)
- An entry that resolves to the root or its parent is refused: `classifyProtected` cases `<abs>/link` (fatal `root_or_parent`) and a symlink to the root's parent, plus the Start refusal outline (unit)
- Relative and resolved-spelling absolute entries are unchanged, and internal symlink components keep their spelling: keep `TestProtectedClassification` and `TestProtectedDropBounds` unchanged, add cases `<real>/inner/x`, `<link>/inner/x` (both give `inner/x`) and `<real>/out/f` (gives `out/f`) (unit)
- The hook denies writes through both spellings on the resulting policy: the existing hook tests cover lexical/resolved matching, and the acceptance scenario runs `RunHook pretool` on Start's written policy (integration)

## Feasibility
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/k-exec-protected-absolute-path-symlinked-root__steps.js"],"observers":["features/steps/k-exec-protected-absolute-path-symlinked-root__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k-exec-protected-absolute-path-symlinked-root__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k-exec-protected-absolute-path-symlinked-root__steps.js bad","exit":1,"output":"observer bad rejected\n"}]}
