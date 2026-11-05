# Keep invalid UTF-8 protected-drop entries bounded

Slug: fix-k-exec-protected-paths-dropped-visible
Model: not applicable — a stateless string sanitization and truncation inside protected-entry classification; no new state
Acceptance:
- .kogen/intents/fix-k-exec-protected-paths-dropped-visible/acceptance.feature
- features/steps/fix-k-exec-protected-paths-dropped-visible__steps.js

This fixes a review finding on the landed change that reports dropped protected paths. It concerns how `classifyProtected` in `executor/claudecode/claudecode.go` (currently lines 576–582) bounds each dropped entry before it reaches the `executor_started` event (`protected_dropped[].entry`) or the fatal `protected path root_or_parent: <entry>` diagnostic. The finding was "An entry with an invalid byte in its first 256 bytes is trimmed to just before that byte, so it can end up short or empty. A short invalid entry grows past 256 bytes after marshalling (U+FFFD is 3 bytes)."

It reproduces on current main (scratch probe through `Start` with the unchanged tree):
- `/elsewhere/` + byte 0xFF + 300×`a` is reported as `/elsewhere/` (11 bytes).
- byte 0xFF + `/../../x` + 300×`a` (cleaned to `../xaaa…`, outside the checkout) is reported as the empty string.
- `/elsewhere/` + 120×(byte 0xFF, `a`) (251 bytes, so not truncated) stays invalid UTF-8 in the event and marshals to 491 UTF-8 bytes.

The current approach cuts at 256 bytes and then drops trailing bytes while the string is invalid UTF-8. The fix replaces it. First run `strings.ToValidUTF8(original, "�")` on the original entry. If the result is longer than 256 bytes, cut it at 256 bytes and back up to the start of the rune at the cut (for example with `utf8.RuneStart`), so the entry ends on a rune boundary with no suffix. The bounded entry is therefore always valid UTF-8 of at most 256 bytes, before and after JSON marshalling. Valid entries are bounded exactly as before. Classification, reasons, order, the first-20 list, the full count, usable-path normalization and every other Start behavior are unchanged. No unrelated changes.

## Decisions
- Reproduce first: a Go regression test that fails on current main for exactly the reported inputs, then the fix. The scenario does hold on main (see the reproduction above), so a code change is required. (source: request)
- Sanitize with `strings.ToValidUTF8` using the replacement `�` (the character JSON marshalling would show), before measuring and cutting. When over 256 bytes, cut at 256 and back up to a rune boundary at the cut. (source: request)
- The same bounded entry feeds both the dropped list and the fatal root_or_parent diagnostic, as today. (source: request)
- Add a non-UTF-8 Go test in `executor/claudecode/protected_test.go` covering the three reproducing inputs and their exact fixed results, listed under Tests. (source: request)

## Source comparison
- Addressed: "invalid byte in its first 256 bytes … trimmed to just before that byte … short": scenario 1 (`/elsewhere/` + 0xFF + 300×`a`, expected `/elsewhere/�` + 242×`a`, 256 bytes).
- Addressed: "… or empty": scenario 2 (0xFF + `/../../x` + 300×`a`, expected `�/../../x` + 245×`a`, 256 bytes).
- Addressed: "A short invalid entry grows past 256 bytes after marshalling": scenario 3 (`/elsewhere/` + 120×(0xFF,`a`), expected `/elsewhere/` + 61×(`�`,`a`), 255 bytes). The 256-byte cut lands inside a U+FFFD there, so this case also proves "back up to a rune boundary at the cut".
- Addressed: "Run ToValidUTF8 first" and "Add a non-UTF-8 test": Decisions and Tests. "Keep every existing test green; no unrelated changes": the boundaries in the prose. Existing `TestProtectedDropBounds` (é straddling the cut) and the landed k-exec-protected-paths-dropped-visible scenarios remain as they are.
- Omitted: nothing from the request.

## Tests
- A dropped entry with an invalid byte in its first 256 bytes keeps the rest of its text up to 256 bytes, with U+FFFD for the invalid byte, rather than being cut short or emptied: new non-UTF-8 test in `executor/claudecode/protected_test.go` calling `classifyProtected("/r", …)` with `"/elsewhere/\xff"+300×"a"` → `"/elsewhere/�"+242×"a"` and `"\xff/../../x"+300×"a"` → `"�/../../x"+245×"a"`, both reason `outside_checkout`. It must fail on current main. Plus acceptance scenarios 1–2 through Start (regression)
- A short entry containing invalid bytes is reported as valid UTF-8 that stays within 256 bytes after JSON marshalling: the same Go test with `"/elsewhere/"+120×"\xffa"` → `"/elsewhere/"+61×"�a"` (255 bytes, `utf8.ValidString` true, `json.Marshal`/`Unmarshal` round trip ≤ 256 bytes). Plus acceptance scenario 3 (regression)
- A cut that lands inside a multibyte rune backs up to that rune's start: covered by the scenario 3 input and existing `TestProtectedDropBounds` (é at the cut) (existing)
- Valid entries, ordering, reasons, the first-20 list, the full count and the fatal diagnostic are otherwise unchanged: existing `TestProtectedClassification`, `TestProtectedDropBounds`, adapter tests and the k-exec-protected-paths-dropped-visible acceptance stay green (existing)

## Feasibility
- Reproduced on current main: a scratch copy with the capture test from the step file, driven through `Start`, reported entry lengths 11, 0 and 491 bytes and one string that is not valid UTF-8 for the three inputs. A scratch Go program confirmed that ToValidUTF8 followed by a rune-boundary cut yields exactly the expected 256-, 256- and 255-byte strings.
- evidence: {"id":"invalid-utf8-observer","kind":"observer","inputs":["features/steps/fix-k-exec-protected-paths-dropped-visible__steps.js"],"observers":["features/steps/fix-k-exec-protected-paths-dropped-visible__steps.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/fix-k-exec-protected-paths-dropped-visible__steps.js good","exit":0,"output":"observer good\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/fix-k-exec-protected-paths-dropped-visible__steps.js bad","exit":1,"output":"observer bad rejected\n"}]}
