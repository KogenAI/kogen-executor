# Report wrong-sized runtime downloads by size

Slug: k-exec-install-size-mismatch-diagnosed
Model: not applicable — each binary response is classified once from its announced length, received byte count and digest; the existing retry, lock and publication state is unchanged
Acceptance:
- .kogen/intents/k-exec-install-size-mismatch-diagnosed/acceptance.feature
- features/steps/k-exec-install-size-mismatch-diagnosed__steps.js
- features/steps/k-exec-install-size-mismatch-diagnosed__driver.js

Right now, when the pinned Claude Code binary download (`downloadBinary` in `executor/claudecode/runtime.go`) has the wrong length, the install reports `the downloaded Claude Code 2.1.312 does not match its pinned SHA-256; nothing was installed`. That points users at tampering or a bad pin when the real fault is a truncated or substituted response. A server that announces a length other than the pinned size is also downloaded in full before the mismatch is noticed. This change splits that single refusal into three distinct refusals, and checks the announced length before anything is written.

Rules, applied to every HTTP 200 binary response in this order (M is the pinned size: the platform pin, or the manifest size under the loopback `KOGEN_CLAUDE_CODE_URL` seam; `<source>` is the binary URL `<base>/2.1.312/<platform>/claude`):
1. Announced length. If the response announces a length (Go's `resp.ContentLength >= 0`) and it is not M, refuse before the output file is created or any body byte is read. The response body is closed unread, so the connection closes and the origin never has to send the body. Exact detail: `cannot download Claude Code 2.1.312 from <source>: the response announces <A> bytes, expected <M>; nothing was installed`.
2. Received length. The body is still read through the existing limit of M+1 bytes, so at most M+1 bytes are ever written to `<root>/.partial-*/claude`. If a completed body (one that ended without a transport error, for example a chunked body that terminates early) has N < M bytes: `the downloaded Claude Code 2.1.312 is shorter than its pinned size: received <N> bytes, expected <M>; nothing was installed`. If it reached M+1 bytes: `the downloaded Claude Code 2.1.312 is longer than its pinned size: received <M+1> bytes, expected <M>; nothing was installed`. Here N is the byte count actually read, so a longer body always reports M+1.
3. Checksum. Only a body of exactly M bytes whose SHA-256 differs from the pin keeps the existing message `the downloaded Claude Code 2.1.312 does not match its pinned SHA-256; nothing was installed`. That message mentions no sizes, and the size messages do not mention SHA-256.

All three refusals are `executor/unavailable` (the existing `unavailable` helper). None of them is retried, so exactly one binary request is made. Nothing is installed: the version directory is not created, and the `.partial-*` directory is removed as today. A declared Content-Length equal to M whose body is cut off by a transport error stays a retryable transport failure, as before. Non-200 handling, idle stall, context classification, the retry loop and pause, the install lock, the manifest seam, `--version` verification, executable permissions, atomic publication and the success stderr lines are unchanged. The correct file still installs.

Technical settlement:
- The exact wording of the three size refusals is as quoted in the rules above.
- A longer body reports the M+1 bytes actually read.
- The announced-length refusal uses the existing `cannot download Claude Code 2.1.312 from <source>: ` prefix, so it names the source.
- All three refusals end with `; nothing was installed`, like the existing checksum refusal.
- Size refusals are permanent, like the existing completed size or checksum mismatch, and are never retried.

## Decisions
- Before any body byte is written, a response that announces a length different from the pinned size is refused at once. The refusal names the source, the announced length and the expected size, and nothing is downloaded. (source: request)
- After the body is read, a length other than the expected size is reported as "received N bytes, expected M" and distinguished as shorter or longer. Only a right-sized body with a different SHA-256 says the checksum does not match. (source: request)
- In every refusal nothing is installed and the partial directory is removed. A body longer than expected is still cut one byte past the expected size. (source: request)

## Source comparison
- Addressed, Problem: the old single `does not match its pinned SHA-256` refusal for wrong-length bodies is replaced by rules 1 and 2. The prior Intent k-exec-install-download-transient-retry said to keep `does not match` for completed size mismatches; that is superseded for size mismatches and kept for checksum mismatches.
- Addressed, Synthetic "200 with a 1 KB page": row `page`. The origin sends a 1024-byte HTML page chunked, with no announced length, and the expected exact message has `received 1024 bytes, expected 4096` and `shorter`, with no `SHA-256`. A 1 KB page that does announce `Content-Length: 1024` is covered by rule 1 (row `announced`).
- Addressed, Synthetic "right number of bytes with one byte flipped": row `flipped`, exact checksum message without sizes.
- Addressed, Synthetic "announcing a Content-Length different from the pin": rows `announced` (1024, shorter) and `announced-longer` (1048576). The origin sends headers, then withholds the body until the client closes the connection or 3 s pass, and records `closedBeforeBody`. There is one request, no `.partial-*` remains and no runtime directory exists.
- Addressed, Synthetic "no announced length (chunked) that ends early": row `chunked-short`, a correctly terminated chunked body carrying the first 2048 of 4096 bytes, reported as shorter with counts.
- Addressed, Synthetic "streams more than the expected size": row `longer`. The body is chunked: 4096 correct bytes, then up to 8 MiB more. While streaming, the origin stats `<root>/.partial-*/claude` and requires that it never exceeds 4097 bytes. The refusal is `longer` with `received 4097 bytes, expected 4096`.
- Addressed, Synthetic "the correct file still installs": row `correct`.
- Fixture literals: version 2.1.312, a 4096-byte runtime script answering `2.1.312 (Claude Code)`, platform linux-x64, test seam `KOGEN_CLAUDE_CODE_URL` on loopback.
- Omitted: no requested behavior is omitted. No new setting, retry or resume.

## Tests
- An announced Content-Length different from the pin is refused before the body, naming source, announced and expected sizes, with one request, no retry and no partial directory: acceptance rows `announced` and `announced-longer`. Also update the `size mismatch` row of TestInstallRefusals in executor/claudecode/runtime_test.go, whose small unflushed body gets an automatic Content-Length of M+1, to expect the announced-length detail (integration)
- A completed body shorter than the pin reports received/expected counts and `shorter`, not SHA-256: acceptance rows `page` and `chunked-short` (regression)
- A body longer than the pin is cut at M+1 written bytes and reported as `longer` with `received M+1 bytes`: acceptance row `longer` (regression)
- A right-sized body with a different digest keeps the exact checksum message without sizes: acceptance row `flipped` and the existing `digest mismatch` row of TestInstallRefusals (existing)
- The size refusals are not retried, while transient failures before them still are: update TestDownloadRetryTimingAndFreshBody's mismatch case, whose third response announces half the size, to expect the announced-length refusal after the same three requests and two retry lines (integration)
- The correct file still installs, and existing safeguards (lock, retries, stall, context, version check, manifest seam) are preserved: acceptance row `correct` and the existing runtime_test.go tests plus the configured checks (existing)

## Feasibility
- Scratch overlay probes on the unchanged tree with the final capture: all five wrong-size origins return the old `does not match its pinned SHA-256` detail with `closedBeforeBody` false, and `flipped` and `correct` already behave as specified. A scratch installer with the M+1 limit removed made the `longer` origin observe an 8 MiB partial file (`fileWithinBound` false). A scratch early `resp.ContentLength` refusal made the `announced` and `announced-longer` origins observe the connection close before the body, three times out of three. These results are recorded as the driver's known-bad fixtures and as the observer's sensitivity evidence, not as an implementation.
- evidence: {"id":"size-observer","kind":"observer","inputs":["features/steps/k-exec-install-size-mismatch-diagnosed__driver.js",".kogen/intents/k-exec-install-size-mismatch-diagnosed/acceptance.feature"],"observers":["features/steps/k-exec-install-size-mismatch-diagnosed__driver.js"],"checks":[{"name":"good","command":"node features/steps/k-exec-install-size-mismatch-diagnosed__driver.js good","exit":0,"output":"observer accepted 7 rows\n"},{"name":"bad","command":"node features/steps/k-exec-install-size-mismatch-diagnosed__driver.js bad","exit":1,"output":"observer rejected 110 known-bad results\n"}]}
