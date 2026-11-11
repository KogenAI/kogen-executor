'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const P = 'tool-args-log-leaks-secrets-and-masks-commands: ';

// DRIVER is the Go acceptance driver. It runs one real Claude Code adapter Shape round against a
// scripted fake runtime (the same binary) and prints every run-log event the adapter emitted, one
// JSON object per line. It makes no model call. It is compiled inside this module through a
// go build -overlay, so no Go file is added to the checkout.
const DRIVER = String.raw`package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

// call is one scripted tool call: the tool name and its exact input object. Only tools that are
// not guarded by the PreToolUse hook are scripted, so every call is answered as accepted.
type call struct {
	Name  string          "json:\"name\""
	Input json.RawMessage "json:\"input\""
}

func flag(args []string, name string) string {
	for i, a := range args {
		if a == name && i+1 < len(args) {
			return args[i+1]
		}
	}
	return ""
}

// fake is the scripted runtime round: init, each call's tool_use and accepted tool_result, then a
// success result with a structured_output object.
func fake(args []string) int {
	var calls []call
	b, err := os.ReadFile(os.Getenv("TOOL_ARGS_FIXTURE_CALLS"))
	if err != nil || json.Unmarshal(b, &calls) != nil {
		fmt.Fprintln(os.Stderr, "fake runtime: unreadable calls")
		return 70
	}
	io.Copy(io.Discard, os.Stdin)
	sid := flag(args, "--session-id")
	cwd, _ := os.Getwd()
	cwd, _ = filepath.EvalSymlinks(cwd)
	out := func(m map[string]any) {
		j, _ := json.Marshal(m)
		os.Stdout.Write(append(j, '\n'))
	}
	source := "none"
	if os.Getenv("TOOL_ARGS_FIXTURE_BAD_TRANSPORT") == "1" {
		source = "ANTHROPIC_API_KEY"
	}
	out(map[string]any{"type": "system", "subtype": "init", "cwd": cwd, "session_id": sid, "mcp_servers": []any{},
		"model": "claude-sonnet-5-5", "permissionMode": "acceptEdits", "apiKeySource": source, "claude_code_version": "fixture"})
	for i, c := range calls {
		id := fmt.Sprintf("toolu_%d", i+1)
		out(map[string]any{"type": "assistant", "session_id": sid, "message": map[string]any{"role": "assistant", "model": "claude-sonnet-5-5",
			"content": []any{map[string]any{"type": "tool_use", "id": id, "name": c.Name, "input": c.Input}}}})
		out(map[string]any{"type": "user", "session_id": sid, "message": map[string]any{"role": "user",
			"content": []any{map[string]any{"type": "tool_result", "tool_use_id": id, "content": "ok", "is_error": false}}},
			"tool_result_meta": []any{map[string]any{"id": id, "permission_decision": map[string]any{"decision": "accept"}}}})
	}
	out(map[string]any{"type": "result", "subtype": "success", "is_error": false, "num_turns": len(calls) + 1,
		"session_id": sid, "result": "done", "terminal_reason": "completed", "permission_denials": []any{},
		"structured_output": map[string]any{"ok": true}})
	return 0
}

// round runs one adapter Shape round over the calls file in a fresh temporary checkout and returns
// the emitted events. The adapter's base environment is this process's environment.
func round(callsPath string, extraEnv ...string) ([]map[string]any, error) {
	tmp, err := os.MkdirTemp("", "tool-args-fixture-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	root, home := filepath.Join(tmp, "checkout"), filepath.Join(tmp, "home")
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(claudecode.RuntimeDir(home), 0o700); err != nil {
		return nil, err
	}
	if err := os.Symlink(exe, claudecode.RuntimePath(home)); err != nil {
		return nil, err
	}
	env := append(os.Environ(), "TOOL_ARGS_FIXTURE_CALLS="+callsPath)
	a := claudecode.New(claudecode.Options{
		Home: home, HookCommand: []string{exe, "hook"},
		Env: append(env, extraEnv...),
	})
	var mu sync.Mutex
	var events []map[string]any
	sink := func(e map[string]any) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, e)
	}
	s, err := a.Start(context.Background(), executor.Task{
		Role: executor.RoleShape, Root: root, Home: home, Dir: filepath.Join(tmp, "artifacts"),
		Model: "claude-sonnet-5-5", Effort: "high", RunID: "tool-args-fixture", MaxRounds: 1,
		Schema: []byte("{\"type\":\"object\"}"), Brief: executor.Brief{Stable: "tool argument fixture"},
	}, sink)
	if err != nil {
		return nil, err
	}
	defer s.Close()
	_, err = s.Round(context.Background(), executor.Input{})
	mu.Lock()
	defer mu.Unlock()
	return events, err
}

// control runs one fixed round with a Bash call whose secret-named assignment is redacted on the
// unchanged tree: good with the honest transport, bad with a transport the adapter must refuse.
// It qualifies the scripted runtime and the record path, not the requested feature.
func control(bad bool) int {
	dir, err := os.MkdirTemp("", "tool-args-control-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(dir)
	path := filepath.Join(dir, "calls.json")
	if err := os.WriteFile(path, []byte("[{\"name\":\"Bash\",\"input\":{\"command\":\"DB_PASSWORD=s3cr3tVALUE9x ./run\"}}]"), 0o600); err != nil {
		panic(err)
	}
	var extra []string
	if bad {
		extra = append(extra, "TOOL_ARGS_FIXTURE_BAD_TRANSPORT=1")
	}
	events, err := round(path, extra...)
	if err != nil {
		fmt.Println("FAIL: round refused")
		return 1
	}
	for _, e := range events {
		if e["event"] == "executor_tool" {
			args, _ := e["arguments"].(map[string]any)
			fmt.Printf("PASS: logged %v\n", args["command"])
			return 0
		}
	}
	fmt.Println("FAIL: no tool record")
	return 1
}

func main() {
	a := os.Args[1:]
	switch {
	case len(a) == 1 && a[0] == "--version":
		fmt.Println(claudecode.Version + " (Claude Code)")
	case len(a) >= 2 && a[0] == "auth" && a[1] == "status":
		fmt.Println("{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"apiProvider\":\"firstParty\"}")
	case len(a) > 0 && a[0] == "-p":
		os.Exit(fake(a))
	case len(a) > 0 && a[0] == "hook":
		os.Exit(claudecode.RunHook(a[1:], os.Stdin, os.Stdout, os.Stderr))
	case len(a) == 1 && (a[0] == "control-good" || a[0] == "control-bad"):
		os.Exit(control(a[0] == "control-bad"))
	case len(a) == 2 && a[0] == "run":
		events, err := round(a[1])
		for _, e := range events {
			j, jerr := json.Marshal(e)
			if jerr != nil {
				fmt.Fprintln(os.Stderr, "unencodable event:", jerr)
				os.Exit(70)
			}
			fmt.Println(string(j))
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "round failed:", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintln(os.Stderr, "usage: driver run <calls.json> | control-good | control-bad")
		os.Exit(64)
	}
}
`;

// fixtureEnv is the driver's whole environment: only PATH, TMPDIR and the scenario's variables,
// so the adapter's base environment is the fixture's own.
function fixtureEnv(extra) {
  return { PATH: process.env.PATH, ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}), ...(extra || {}) };
}

// driver builds DRIVER once per process from a virtual package directory of this module and
// returns the binary path.
let driverBin;
function driver() {
  if (!driverBin) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-args-driver-'));
    process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
    const root = process.cwd();
    const pkg = 'features/steps/tool-args-log-leaks-secrets-and-masks-commands-driver';
    fs.writeFileSync(path.join(dir, 'main.go'), DRIVER);
    fs.writeFileSync(path.join(dir, 'overlay.json'), JSON.stringify({ Replace: { [path.join(root, pkg, 'main.go')]: path.join(dir, 'main.go') } }));
    const bin = path.join(dir, 'driver');
    const built = spawnSync('go', ['build', '-overlay', path.join(dir, 'overlay.json'), '-o', bin, './' + pkg],
      { cwd: root, env: { ...process.env, PWD: root }, encoding: 'utf8', timeout: 170000 });
    assert.equal(built.status, 0, `go build of the driver: ${built.error || ''}\n${built.stdout}${built.stderr}`);
    driverBin = bin;
  }
  return driverBin;
}

if (require.main === module) {
  // node <this file> control-good|control-bad: the driver's transport controls (see Feasibility).
  const r = spawnSync(driver(), [process.argv[2] || ''], { encoding: 'utf8', env: fixtureEnv(), timeout: 60000 });
  process.stdout.write(r.stdout + r.stderr);
  process.exitCode = r.status === null ? 1 : r.status;
} else {
  const { Given, When, Then } = require('@cucumber/cucumber');

  // expand turns every {{text*n}} in a fixture string into text repeated n times, so made-up
  // tokens of an exact length need not be written out in this repository.
  const expand = (v) => {
    if (typeof v === 'string') return v.replace(/\{\{([^*{}]+)\*(\d+)\}\}/g, (_, text, n) => text.repeat(Number(n)));
    if (Array.isArray(v)) return v.map(expand);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [expand(k), expand(x)]));
    return v;
  };

  const strings = (v, out = []) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out); }
    return out;
  };

  const runRound = (world, calls) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-args-calls-'));
    try {
      const callsPath = path.join(dir, 'calls.json');
      fs.writeFileSync(callsPath, JSON.stringify(calls));
      const r = spawnSync(driver(), ['run', callsPath], { encoding: 'utf8', env: fixtureEnv(world.adapterEnv), timeout: 60000, maxBuffer: 64 << 20 });
      assert.equal(r.status, 0, `driver run: ${r.error || ''}\n${r.stdout}${r.stderr}`);
      world.calls = calls;
      world.events = r.stdout.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  // record is the single executor_tool record of the round.
  const record = (world) => {
    assert.ok(world.events, 'the adapter round must have run');
    const tools = world.events.filter((e) => e.event === 'executor_tool');
    assert.equal(tools.length, 1, `one executor_tool record: ${JSON.stringify(tools)}`);
    assert.ok(tools[0].arguments && typeof tools[0].arguments === 'object', `the record has an arguments object: ${JSON.stringify(tools[0])}`);
    return tools[0];
  };

  Given(P + 'the adapter environment has {string} set to {string}', function (name, value) {
    this.adapterEnv = { ...(this.adapterEnv || {}), [name]: value };
  });

  When(new RegExp('^' + P + 'a shape round runs the command: (.+)$'), { timeout: 240000 }, function (command) {
    runRound(this, [{ name: 'Bash', input: { command: expand(command) } }]);
  });

  When(P + 'a shape round makes a {string} tool call with input:', { timeout: 240000 }, function (name, doc) {
    runRound(this, [{ name, input: expand(JSON.parse(doc)) }]);
  });

  Then(new RegExp('^' + P + 'the Bash command is logged as: (.+)$'), function (logged) {
    assert.deepStrictEqual(record(this).arguments, { command: expand(logged) });
  });

  Then(P + 'the Bash command is logged unchanged', function () {
    assert.deepStrictEqual(record(this).arguments, { command: this.calls[0].input.command });
  });

  Then(P + 'the tool call is logged with arguments:', function (doc) {
    assert.deepStrictEqual(record(this).arguments, expand(JSON.parse(doc)));
  });

  Then(P + 'no run-log event contains {string}', function (text) {
    const secret = expand(text);
    assert.ok(this.events && this.events.length > 0, 'the adapter round must have emitted run-log events');
    for (const e of this.events) {
      for (const s of strings(e)) {
        assert.ok(!s.includes(secret), `run-log event ${e.event} contains ${JSON.stringify(secret)}: ${JSON.stringify(e)}`);
      }
    }
  });
}
