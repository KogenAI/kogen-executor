// Package contract_test is kogen-executor's contract suite: it pins exactly what the consumers
// of this module (kogen, kogen-shaping and kogen-build) use from it.
//
// It pins the exported API they call, the behaviours they rely on, and the file and wire
// formats they read or write: the executor constants, errors and Descriptor.For; the Claude
// Code adapter's runtime layout, hook, first-prompt bytes, stream-json handling and run-log
// events; the conformance helpers; the agent's generic tool definitions, shared prompt material
// and template mechanism, WithOriginHint and the response budget; thinking.Strip; and
// testproc.Isolate. Each phase's own prompt and submission tools are pinned by the phase.
//
// The cases are copied and adapted from the consumers' own tests that exercise this module,
// pinned at kogen 9bf6073, kogen-shaping c7ba24b and kogen-build 65f9d77. They use synthetic
// fixtures only (a fake sh `claude`, temporary checkouts): no model runs, no network, no
// download of the real Claude Code runtime, and no import or read of a consumer repository.
// Each assertion message names the contract item and the consumer it comes from.
//
// An intended interface change edits this directory in the same change, together with its
// paired consumer items: the tests of kogen, kogen-shaping and kogen-build named in the
// assertion messages. A failure here that is not an intended change is a break to fix in
// kogen-executor.
package contract_test

import _ "github.com/KogenAI/kogen-executor/internal/golden" // registers the -update test flag
