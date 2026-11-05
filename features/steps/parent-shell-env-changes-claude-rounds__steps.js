'use strict';
// Acceptance steps for parent-shell-env-changes-claude-rounds. A capture test, copied with the
// executor/claudecode package into a temporary directory of this module, calls childEnv/shapeEnv
// and runs fake-Claude rounds; these steps judge its JSON output.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const P = 'parent-shell-env-changes-claude-rounds: ';
const TEST = 'TestParentShellEnvCapture';

const key = kv => kv.slice(0, kv.indexOf('=') < 0 ? kv.length : kv.indexOf('='));
const withKey = (env, k) => env.filter(kv => key(kv) === k);

// verifyChild: env holds none of the stripped names and is exactly the expected entries (any order).
function verifyChild(env, stripped, expected) {
  for (const name of stripped) assert.deepEqual(withKey(env, name), [], `stripped variable ${name} reached the child environment`);
  for (const entry of expected) assert.deepEqual(withKey(env, key(entry)), [entry], `child environment entries for ${key(entry)}`);
  assert.deepEqual([...env].sort(), [...expected].sort(), 'child environment is not exactly the expected entries');
}

// verifyShape: shape is the child environment with its GIT_OPTIONAL_LOCKS entries replaced by exactly one GIT_OPTIONAL_LOCKS=0.
function verifyShape(shape, child) {
  assert.deepEqual(withKey(shape, 'GIT_OPTIONAL_LOCKS'), ['GIT_OPTIONAL_LOCKS=0'], 'Shape environment GIT_OPTIONAL_LOCKS entries');
  const rest = env => env.filter(kv => key(kv) !== 'GIT_OPTIONAL_LOCKS');
  assert.deepEqual(rest(shape), rest(child), 'Shape environment differs from the child environment beyond GIT_OPTIONAL_LOCKS');
}

// verifyRounds: every role's round ran without --model and its fake claude saw none of the names.
function verifyRounds(capture, names) {
  const roles = ['build', 'shape', 'review'];
  assert.deepEqual(Object.keys(capture.rounds || {}).sort(), [...roles].sort(), 'captured round roles');
  for (const role of roles) {
    assert.ok(!capture.argv[role].includes('--model'), `the ${role} round passed --model: ${JSON.stringify(capture.argv[role])}`);
    for (const name of names) assert.deepEqual(withKey(capture.rounds[role], name), [], `parent ${name} reached the ${role} round's claude`);
  }
}

function verifyShapeRound(capture, entry) {
  assert.deepEqual(withKey(capture.rounds.shape, key(entry)), [entry], `Shape round entries for ${key(entry)}`);
}

// verifyGit: git rev-parse printed the checkout's top level and Git directory and nothing of the other repository.
function verifyGit(git) {
  assert.ok(git.checkout && git.other && git.checkout !== git.other, `checkout and other repository paths: ${JSON.stringify(git)}`);
  assert.deepEqual(git.output.split('\n'), [git.checkout, path.join(git.checkout, '.git'), ''], `git rev-parse output in the round: ${JSON.stringify(git)}`);
  assert.ok(!git.output.includes(git.other), `git rev-parse in the round printed the other repository ${git.other}: ${JSON.stringify(git.output)}`);
}

function verifyDocs(file, text, names) {
  const missing = names.filter(n => !text.includes('`' + n + '`'));
  assert.deepEqual(missing, [], `${file} does not name these variables in backticks`);
}

const CAPTURE_GO = `package claudecode

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/conformance"
)

func ${TEST}(t *testing.T) {
	var in struct {
		Mode     string   \`json:"mode"\`
		Stripped []string \`json:"stripped"\`
		Kept     []string \`json:"kept"\`
		Parent   []string \`json:"parent"\`
		Command  string   \`json:"command"\`
		GitVars  []string \`json:"git_vars"\`
	}
	if err := json.Unmarshal([]byte(os.Getenv("PSE_INPUT")), &in); err != nil {
		t.Fatal(err)
	}
	out := map[string]any{}
	switch in.Mode {
	case "direct":
		base := append([]string{}, in.Kept...)
		base = append(base, "CLAUDE_CONFIG_DIR=old", "CLAUDE_CONFIG_DIR=older", "HOME=old", "HOME=older",
			"DISABLE_UPDATES=0", "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=0", "CLAUDE_CODE_DISABLE_AUTO_MEMORY=0")
		for _, k := range in.Stripped {
			base = append(base, k+"=inherited")
		}
		direct := childEnv(base, "/h", "", "/cfg")
		out["direct"], out["shape"] = direct, shapeEnv(direct)
	case "rounds":
		rounds, argv := map[string][]string{}, map[string][]string{}
		for _, role := range []string{executor.RoleBuild, executor.RoleShape, executor.RoleReview} {
			r, schema := finishRound, buildSchema
			if role != executor.RoleBuild {
				r.Structured = json.RawMessage(\`{"verdict":"approve"}\`)
				schema = \`{"type":"object","properties":{"verdict":{"type":"string"}}}\`
			}
			h := newHarness(t, fakeConfig{Script: oneRound(r)})
			h.task.Role, h.task.Model, h.task.Schema = role, "", json.RawMessage(schema)
			s, err := h.start(h.f.options(in.Parent...))
			if err != nil {
				t.Fatalf("%s round start: %v", role, err)
			}
			_, err = s.Round(context.Background(), executor.Input{})
			s.Close()
			if err != nil {
				t.Fatalf("%s round: %v", role, err)
			}
			rounds[role], argv[role] = h.f.env(1), h.f.argv(1)
		}
		out["rounds"], out["argv"] = rounds, argv
	case "git":
		other := conformance.NewCheckout(t)
		dump := filepath.Join(t.TempDir(), "rev-parse.txt")
		var parent []string
		for _, v := range in.GitVars {
			switch v {
			case "GIT_DIR":
				parent = append(parent, "GIT_DIR="+filepath.Join(other, ".git"))
			case "GIT_WORK_TREE":
				parent = append(parent, "GIT_WORK_TREE="+other)
			default:
				t.Fatalf("unknown Git variable %s", v)
			}
		}
		round := conformance.RoundScript{Actions: []conformance.Action{{Shell: in.Command + " > '" + dump + "' 2>&1"}}, End: "finish", Claim: "done"}
		h := newHarness(t, fakeConfig{Script: oneRound(round)})
		s, err := h.start(h.f.options(parent...))
		if err != nil {
			t.Fatalf("git round start: %v", err)
		}
		_, err = s.Round(context.Background(), executor.Input{})
		s.Close()
		if err != nil {
			t.Fatalf("git round: %v", err)
		}
		b, err := os.ReadFile(dump)
		if err != nil {
			t.Fatalf("the fake claude did not run %q: %v", in.Command, err)
		}
		out["git"] = map[string]any{"checkout": h.root, "other": other, "output": string(b)}
	default:
		t.Fatalf("unknown mode %q", in.Mode)
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("PSE_OUTPUT"), b, 0o600); err != nil {
		t.Fatal(err)
	}
}
`;

function capture(input) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.pse-capture-'));
  try {
    for (const name of fs.readdirSync('executor/claudecode').filter(n => n.endsWith('.go'))) fs.copyFileSync(path.join('executor/claudecode', name), path.join(dir, name));
    fs.writeFileSync(path.join(dir, 'pse_capture_test.go'), CAPTURE_GO);
    const output = path.join(dir, 'capture.json');
    const command = `go test -count=1 -run '^${TEST}$' ./${path.basename(dir)}`;
    const r = spawnSync('go', ['test', '-count=1', '-run', `^${TEST}$`, './' + path.basename(dir)], { encoding: 'utf8', timeout: 240000, env: { ...process.env, PSE_INPUT: JSON.stringify(input), PSE_OUTPUT: output } });
    assert.equal(r.status, 0, `${TEST}: \`${command}\` (mode ${input.mode}) exited ${r.status} ${r.error || ''}\n${r.stdout}${r.stderr}`);
    assert.ok(fs.existsSync(output), `${TEST} was absent, skipped or ran zero times: \`${command}\` exited ${r.status} without writing its capture\n${r.stdout}${r.stderr}`);
    return JSON.parse(fs.readFileSync(output, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  // Observer controls: known-good captures are accepted, each known-bad mutation is rejected.
  const stripped = ['ANTHROPIC_MODEL', 'GIT_DIR', 'GIT_CONFIG_KEY_0', 'MAX_THINKING_TOKENS'];
  const expected = ['PATH=/bin', 'GIT_OPTIONAL_LOCKS=1', 'CLAUDE_CONFIG_DIR=/cfg', 'HOME=/h', 'DISABLE_UPDATES=1'];
  const shape = ['PATH=/bin', 'CLAUDE_CONFIG_DIR=/cfg', 'HOME=/h', 'DISABLE_UPDATES=1', 'GIT_OPTIONAL_LOCKS=0'];
  const names = ['ANTHROPIC_MODEL', 'MAX_THINKING_TOKENS'];
  const roundEnv = ['PATH=/bin', 'CLAUDE_CONFIG_DIR=/cfg'];
  const rounds = () => ({ rounds: { build: [...roundEnv], shape: [...roundEnv, 'GIT_OPTIONAL_LOCKS=0'], review: [...roundEnv] }, argv: { build: ['-p'], shape: ['-p'], review: ['-p'] } });
  const git = { checkout: '/w/checkout', other: '/w/other', output: '/w/checkout\n/w/checkout/.git\n' };
  const docs = 'Strips `ANTHROPIC_MODEL` and `GIT_CONFIG_KEY_<n>`.';
  const docNames = ['ANTHROPIC_MODEL', 'GIT_CONFIG_KEY_<n>'];
  const good = () => {
    verifyChild(expected, stripped, expected);
    verifyShape(shape, expected);
    verifyRounds(rounds(), names);
    verifyShapeRound(rounds(), 'GIT_OPTIONAL_LOCKS=0');
    verifyGit(git);
    verifyDocs('docs', docs, docNames);
  };
  good();
  if (process.argv[2] === 'good') {
    console.log('accepted');
  } else {
    const bad = [];
    for (const name of stripped) bad.push(() => verifyChild([...expected, name + '=inherited'], stripped, expected));
    for (const entry of expected) {
      bad.push(() => verifyChild(expected.filter(v => v !== entry), stripped, expected));
      bad.push(() => verifyChild([...expected, entry], stripped, expected));
      bad.push(() => verifyChild(expected.map(v => (v === entry ? entry + 'x' : v)), stripped, expected));
    }
    bad.push(() => verifyChild([...expected, 'EXTRA=1'], stripped, expected));
    bad.push(() => verifyShape([...shape, 'GIT_OPTIONAL_LOCKS=0'], expected));
    bad.push(() => verifyShape(shape.map(v => (v === 'GIT_OPTIONAL_LOCKS=0' ? 'GIT_OPTIONAL_LOCKS=1' : v)), expected));
    bad.push(() => verifyShape(shape.filter(v => v !== 'PATH=/bin'), expected));
    for (const role of ['build', 'shape', 'review']) {
      for (const name of names) bad.push(() => { const c = rounds(); c.rounds[role].push(name + '=1'); verifyRounds(c, names); });
      bad.push(() => { const c = rounds(); c.argv[role].push('--model', 'x'); verifyRounds(c, names); });
      bad.push(() => { const c = rounds(); delete c.rounds[role]; verifyRounds(c, names); });
    }
    bad.push(() => { const c = rounds(); c.rounds.shape.push('GIT_OPTIONAL_LOCKS=0'); verifyShapeRound(c, 'GIT_OPTIONAL_LOCKS=0'); });
    bad.push(() => { const c = rounds(); c.rounds.shape.pop(); verifyShapeRound(c, 'GIT_OPTIONAL_LOCKS=0'); });
    bad.push(() => verifyGit({ ...git, output: '/w/other\n/w/other/.git\n' }));
    bad.push(() => verifyGit({ ...git, output: '/w/checkout\n/w/other/.git\n' }));
    bad.push(() => verifyGit({ ...git, output: '' }));
    bad.push(() => verifyGit({ ...git, output: 'fatal: not a git repository\n' }));
    for (const n of docNames) bad.push(() => verifyDocs('docs', docs.replace('`' + n + '`', n), docNames));
    for (const f of bad) assert.throws(f);
    console.log('rejected');
    process.exitCode = 1;
  }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  const T = { timeout: 300000 };
  When(P + 'childEnv runs over a base of these kept entries, inherited overrides of the managed values and every one of these stripped names:', T, function (doc) {
    this.pse = JSON.parse(doc);
    this.pseCapture = capture({ mode: 'direct', kept: this.pse.kept, stripped: this.pse.stripped });
  });
  Then(P + 'the child environment has none of the stripped names and is exactly:', function (doc) {
    verifyChild(this.pseCapture.direct, this.pse.stripped, JSON.parse(doc));
  });
  Then(P + 'shapeEnv over the child environment yields exactly one {string} and changes nothing else', function (entry) {
    assert.equal(entry, 'GIT_OPTIONAL_LOCKS=0');
    verifyShape(this.pseCapture.shape, this.pseCapture.direct);
  });
  When(P + 'a Build, a Shape and a Review round run with no requested model while the parent environment holds:', T, function (doc) {
    this.pseCapture = capture({ mode: 'rounds', parent: JSON.parse(doc) });
  });
  Then(P + 'no round passed --model and the fake claude of every round saw none of these variables:', function (doc) {
    verifyRounds(this.pseCapture, JSON.parse(doc));
  });
  Then(P + 'the fake claude of the Shape round saw exactly one {string}', function (entry) {
    verifyShapeRound(this.pseCapture, entry);
  });
  When(P + 'a Build round\'s fake claude runs {string} in the checkout while the parent exports {string} for another repository', T, function (command, vars) {
    this.pseCapture = capture({ mode: 'git', command, git_vars: vars.split(',') });
  });
  Then(P + 'git printed the checkout\'s top level and Git directory, never the other repository', function () {
    verifyGit(this.pseCapture.git);
  });
  Then(P + '{string} names every one of these variables in backticks:', function (file, doc) {
    verifyDocs(file, fs.readFileSync(file, 'utf8'), JSON.parse(doc));
  });
}
