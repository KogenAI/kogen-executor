'use strict';
// Runs one Claude Code round through the real adapter (fake claude, synthetic token, round-1.stderr
// symlinked to /dev/full) in a copy of the checkout and observes its error and terminal events.
// Run directly with "good" or "bad", it is the observer's known-good / known-bad control.
const assert = require('assert');
const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const P = 'fix-k-exec-round-stream-write-failure: ';
const TEST = 'TestFixKExecRoundFailureWinsAcceptance';
const TEST_FILE = 'executor/claudecode/fix_k_exec_round_failure_wins_acceptance_test.go';
const SOURCE = String.raw`package claudecode

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-loop/sys"
)

func TestFixKExecRoundFailureWinsAcceptance(t *testing.T) {
	mode, out := os.Getenv("FIX_ROUND_FAILURE_CASE"), os.Getenv("FIX_ROUND_FAILURE_OUT")
	if mode == "" || out == "" {
		t.Skip("acceptance case only")
	}
	if f, err := os.OpenFile("/dev/full", os.O_WRONLY, 0); err != nil {
		t.Fatalf("TestFixKExecRoundFailureWinsAcceptance needs a writable /dev/full: %v", err)
	} else {
		f.Close()
	}
	cfg := fakeConfig{Script: oneRound(finishRound), Init: map[string]any{"apiKeySource": "none"}, Auth: goodAuth}
	switch mode {
	case "protocol":
		cfg.Init["permissionMode"] = "default"
	case "usage_limit":
		cfg.AssistantError = "rate_limit"
		cfg.Result = map[string]any{"is_error": true, "terminal_reason": "api_error", "result": ""}
	case "schema":
		cfg.Result = map[string]any{"structured_output": nil}
	case "deadline", "interrupted", "success":
	default:
		t.Fatalf("TestFixKExecRoundFailureWinsAcceptance: unknown case %q", mode)
	}
	h := newHarness(t, cfg)
	if mode == "schema" {
		h.task.Role = executor.RoleReview
		h.task.Schema = json.RawMessage("{\"type\":\"object\",\"properties\":{\"verdict\":{\"type\":\"string\"}}}")
	}
	o := h.f.options()
	o.Token = "a-long-synthetic-token-for-the-buffer"
	s, err := h.start(o)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ss := s.(*session)
	marker := filepath.Join(t.TempDir(), "started")
	tail := "exec '" + ss.bin + "' \"$@\"\n"
	if mode == "deadline" || mode == "interrupted" {
		tail = "exec sleep 30\n"
	}
	wrapper := filepath.Join(t.TempDir(), "wrapper")
	if err := os.WriteFile(wrapper, []byte("#!/bin/sh\nprintf x >&2\n: > '"+marker+"'\n"+tail), 0o700); err != nil {
		t.Fatal(err)
	}
	ss.bin = wrapper
	if err := os.Symlink("/dev/full", filepath.Join(h.task.Dir, "round-1.stderr")); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	switch mode {
	case "deadline":
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
	case "interrupted":
		var cancel context.CancelFunc
		ctx, cancel = context.WithCancel(ctx)
		defer cancel()
		go func() {
			for end := time.Now().Add(20 * time.Second); time.Now().Before(end); time.Sleep(10 * time.Millisecond) {
				if _, err := os.Stat(marker); err == nil {
					break
				}
			}
			cancel()
		}()
	}
	_, err = s.Round(ctx, executor.Input{})
	got := map[string]any{"error": nil, "detail": nil, "failed_events": h.eventsNamed("executor_round_failed"), "ended_events": len(h.eventsNamed("executor_round_ended"))}
	if err != nil {
		got["error"] = "unclassified: " + err.Error()
		if e, ok := sys.AsError(err); ok {
			got["error"] = e.Class + "/" + e.Reason
			got["detail"] = e.Detail
		}
	}
	b, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(out, b, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;

let checkout = null;

function copyCheckout() {
  if (!checkout) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-round-failure-'));
    process.on('exit', () => fs.rmSync(tmp, {recursive: true, force: true}));
    const repo = path.join(tmp, 'repo');
    fs.cpSync(process.cwd(), repo, {recursive: true, filter: (src) => path.basename(src) !== '.git'});
    fs.writeFileSync(path.join(repo, TEST_FILE), SOURCE);
    checkout = {tmp, repo};
  }
  return checkout;
}

function runCase(name) {
  const {tmp, repo} = copyCheckout();
  const out = path.join(tmp, name + '.json');
  fs.rmSync(out, {force: true});
  const args = ['test', './executor/claudecode', '-count=1', '-v', '-run', '^' + TEST + '$'];
  const where = `${TEST} (go ${args.join(' ')} in a copy of the checkout, case ${name})`;
  let log;
  try {
    log = execFileSync('go', args, {cwd: repo, env: {...process.env, FIX_ROUND_FAILURE_CASE: name, FIX_ROUND_FAILURE_OUT: out}, encoding: 'utf8', stdio: 'pipe', timeout: 280000});
  } catch (e) {
    throw new Error(`${where} failed (exit ${e.status}, signal ${e.signal}):\n${e.stdout || ''}${e.stderr || ''}`);
  }
  if (!fs.existsSync(out)) {
    throw new Error(`${where} wrote no outcome; the test was absent, skipped or ran zero times:\n${log}`);
  }
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

function assertOutcome(o, error, detail) {
  assert.deepStrictEqual({error: o.error, detail: o.detail}, {error, detail}, `round error and detail; observed ${JSON.stringify(o)}`);
}

function assertEvents(o, reason, artifact, keptBytes) {
  const failed = o.failed_events || [];
  assert.strictEqual(o.ended_events, 0, `executor_round_ended must not be emitted; observed ${JSON.stringify(o)}`);
  assert.strictEqual(failed.length, 1, `exactly one executor_round_failed event; observed ${JSON.stringify(o)}`);
  const e = failed[0];
  assert.deepStrictEqual(
    {reason: e.reason, detail: e.detail, artifact: e.artifact, kept_bytes: e.kept_bytes},
    {reason, detail: o.detail, artifact, kept_bytes: keptBytes},
    `executor_round_failed fields; observed ${JSON.stringify(e)}`,
  );
}

if (require.main === module) {
  // Controls: the real outcome of the "success" case must satisfy the success expectations (good);
  // plausible wrong events built from that same real outcome must each be rejected by the event
  // observer after the error observer has accepted them (bad).
  const mode = process.argv[2];
  let o;
  try {
    o = runCase('success');
    assertOutcome(o, 'executor/failed', 'cannot persist round-1.stderr after 0 bytes');
  } catch (e) {
    console.log('control broken: ' + e.message);
    process.exit(2);
  }
  if (mode === 'good') {
    try {
      assertEvents(o, 'failed', 'round-1.stderr', 0);
      console.log('accepted');
    } catch (e) {
      console.log('good rejected: ' + e.message);
      process.exitCode = 2;
    }
  } else if (mode === 'bad') {
    const mutations = {
      'wrong reason': (x) => { x.failed_events[0].reason = 'deadline'; },
      'wrong artifact': (x) => { x.failed_events[0].artifact = 'round-1.jsonl'; },
      'missing artifact': (x) => { delete x.failed_events[0].artifact; delete x.failed_events[0].kept_bytes; },
      'wrong kept_bytes': (x) => { x.failed_events[0].kept_bytes = 1; },
      'wrong event detail': (x) => { x.failed_events[0].detail = 'artifact write failed'; },
      'ended event': (x) => { x.ended_events = 1; },
      'two failed events': (x) => { x.failed_events.push(x.failed_events[0]); },
    };
    const accepted = [];
    for (const [name, mutate] of Object.entries(mutations)) {
      const x = JSON.parse(JSON.stringify(o));
      mutate(x);
      try {
        assertOutcome(x, 'executor/failed', 'cannot persist round-1.stderr after 0 bytes');
      } catch (e) {
        accepted.push(name + ' (error observer)');
        continue;
      }
      try {
        assertEvents(x, 'failed', 'round-1.stderr', 0);
        accepted.push(name);
      } catch (e) {
        // rejected as required
      }
    }
    if (accepted.length === 0) {
      console.log('rejected');
      process.exitCode = 1;
    } else {
      console.log('not rejected by the event observer: ' + accepted.join(', '));
      process.exitCode = 3;
    }
  } else {
    console.log('usage: good | bad');
    process.exitCode = 2;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');

  When(P + 'a {string} round runs with round-1.stderr on a full device', {timeout: 300000}, function (name) {
    this.fixRoundFailureOutcome = runCase(name);
  });

  Then(P + 'the round fails with {string} and the detail:', function (error, detail) {
    assert.ok(this.fixRoundFailureOutcome, 'no round was run in this scenario');
    assertOutcome(this.fixRoundFailureOutcome, error, detail);
  });

  Then(P + 'one executor_round_failed event has reason {string}, that detail, artifact {string} and kept_bytes {int}', function (reason, artifact, keptBytes) {
    assert.ok(this.fixRoundFailureOutcome, 'no round was run in this scenario');
    assertEvents(this.fixRoundFailureOutcome, reason, artifact, keptBytes);
  });
}
