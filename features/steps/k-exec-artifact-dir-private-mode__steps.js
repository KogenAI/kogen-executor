'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const prefix = 'k-exec-artifact-dir-private-mode: ';
const test = 'TestArtifactDirPrivateModeCapture';
const tag = s => '`' + s + '`';
const names = ['hook-policy.json', 'claude-settings.json', 'hook-log.jsonl'];
const source = String.raw`package claudecode

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestArtifactDirPrivateModeCapture(t *testing.T) {
	const name = "TestArtifactDirPrivateModeCapture"
	var in struct {
		Setup     string ${tag('json:"setup"')}
		Mode      string ${tag('json:"mode"')}
		Foreign   bool   ${tag('json:"foreign"')}
		ChmodFail bool   ${tag('json:"chmod_fail"')}
	}
	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(json.Unmarshal([]byte(os.Getenv("ADP_INPUT")), &in))
	outPath := os.Getenv("ADP_OUTPUT")
	if outPath == "" {
		t.Fatalf("%s: ADP_OUTPUT is empty", name)
	}
	must(os.Unsetenv("KOGEN_ARTIFACT_DIR_FOREIGN_OWNER"))
	must(os.Unsetenv("KOGEN_ARTIFACT_DIR_CHMOD_FAIL"))
	if in.Foreign {
		must(os.Setenv("KOGEN_ARTIFACT_DIR_FOREIGN_OWNER", "1"))
	}
	if in.ChmodFail {
		must(os.Setenv("KOGEN_ARTIFACT_DIR_CHMOD_FAIL", "1"))
	}
	root := t.TempDir()
	var modeBits os.FileMode
	if in.Mode != "" {
		n, err := strconv.ParseUint(in.Mode, 8, 32)
		must(err)
		modeBits = os.FileMode(n)
	}
	chmodDir := func(p string) {
		t.Helper()
		must(os.MkdirAll(p, 0o755))
		if modeBits != 0 {
			must(os.Chmod(p, modeBits))
		}
		fi, err := os.Lstat(p)
		must(err)
		got := fmt.Sprintf("%04o", fi.Mode().Perm())
		if in.Mode != "" && got != in.Mode {
			t.Fatalf("%s: fixture mode %s, want %s", name, got, in.Mode)
		}
	}
	var given, filesPath, oncePath, ultimate string
	switch in.Setup {
	case "absent":
		given = filepath.Join(root, "absent")
		filesPath = given
	case "directory":
		given = filepath.Join(root, "dir")
		chmodDir(given)
		filesPath = given
	case "symlink":
		target := filepath.Join(root, "target")
		chmodDir(target)
		given = filepath.Join(root, "link")
		must(os.Symlink("target", given))
		filesPath = target
	case "hop":
		hopTarget := filepath.Join(root, "hop-target")
		chmodDir(hopTarget)
		oncePath = filepath.Join(root, "mid")
		must(os.Symlink("hop-target", oncePath))
		given = filepath.Join(root, "hop")
		must(os.Symlink("mid", given))
		filesPath = hopTarget
		ultimate = hopTarget
	case "parent":
		exec := filepath.Join(root, "real", "exec")
		chmodDir(exec)
		must(os.Symlink("real", filepath.Join(root, "parent-link")))
		given = filepath.Join(root, "parent-link", "exec")
		filesPath = given
	default:
		t.Fatalf("%s: unknown setup %q", name, in.Setup)
	}
	h := newHarness(t, fakeConfig{})
	h.task.Dir = given
	s, err := h.start(h.f.options())
	if s != nil {
		defer s.Close()
	}
	class, reason, detail := "", "", ""
	if err != nil {
		if e, ok := sys.AsError(err); ok {
			class, reason, detail = e.Class, e.Reason, e.Detail
		} else {
			class, detail = "untyped", err.Error()
		}
	}
	modeOf := func(p string) string {
		if p == "" {
			return ""
		}
		fi, e := os.Lstat(p)
		if e != nil {
			return ""
		}
		return fmt.Sprintf("%04o", fi.Mode().Perm())
	}
	isSymlink := func(p string) bool {
		fi, e := os.Lstat(p)
		return e == nil && fi.Mode()&os.ModeSymlink != 0
	}
	files := map[string]bool{}
	fileModes := map[string]string{}
	for _, n := range []string{"hook-policy.json", "claude-settings.json", "hook-log.jsonl"} {
		p := filepath.Join(filesPath, n)
		fi, e := os.Lstat(p)
		files[n] = e == nil && fi.Mode()&os.ModeSymlink == 0
		if e == nil {
			fileModes[n] = fmt.Sprintf("%04o", fi.Mode().Perm())
		}
	}
	policyLog := ""
	policyArgs := []string{}
	if b, e := os.ReadFile(filepath.Join(filesPath, "hook-policy.json")); e == nil {
		var pol struct {
			Log string ${tag('json:"log"')}
		}
		if json.Unmarshal(b, &pol) == nil {
			policyLog = pol.Log
		}
	}
	if b, e := os.ReadFile(filepath.Join(filesPath, "claude-settings.json")); e == nil {
		var settings struct {
			Hooks map[string][]struct {
				Hooks []struct {
					Args []string ${tag('json:"args"')}
				} ${tag('json:"hooks"')}
			} ${tag('json:"hooks"')}
		}
		if json.Unmarshal(b, &settings) == nil {
			for _, hookName := range []string{"PreToolUse", "PostToolUse"} {
				for _, group := range settings.Hooks[hookName] {
					for _, hook := range group.Hooks {
						for i := 0; i+1 < len(hook.Args); i++ {
							if hook.Args[i] == "--policy" {
								policyArgs = append(policyArgs, hook.Args[i+1])
							}
						}
					}
				}
			}
		}
	}
	started := 0
	keys := []string{}
	var tightened any
	present := false
	for _, ev := range h.events {
		if ev["event"] != "executor_started" {
			continue
		}
		started++
		if started == 1 {
			for k := range ev {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			if v, ok := ev["artifact_dir_mode_tightened"]; ok {
				present = true
				tightened = v
			}
		}
	}
	ultimateMode := ""
	ultimateFiles := false
	if ultimate != "" {
		ultimateMode = modeOf(ultimate)
		for _, n := range []string{"hook-policy.json", "claude-settings.json", "hook-log.jsonl"} {
			if _, e := os.Lstat(filepath.Join(ultimate, n)); e == nil {
				ultimateFiles = true
			}
		}
	}
	out := map[string]any{
		"class": class, "reason": reason, "detail": detail,
		"mode": modeOf(filesPath), "artifact_symlink": isSymlink(given),
		"files": files, "file_modes": fileModes,
		"policy_log": policyLog, "policy_args": policyArgs,
		"started": started, "keys": keys,
		"tightened_present": present, "tightened": tightened,
		"once_symlink": oncePath != "" && isSymlink(oncePath),
		"ultimate_mode": ultimateMode, "ultimate_files": ultimateFiles,
	}
	b, err := json.Marshal(out)
	must(err)
	must(os.WriteFile(outPath, []byte(strings.ReplaceAll(string(b), root, "$ABS")), 0o600))
}
`;
let scratch;
function run(input) {
  if (!scratch) {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-dir-private-mode-'));
    const repo = path.join(scratch, 'repo');
    fs.cpSync(process.cwd(), repo, {recursive: true, filter: p => !['.git', 'node_modules'].includes(path.basename(p))});
    fs.writeFileSync(path.join(repo, 'executor/claudecode/artifact_dir_private_mode_capture_test.go'), source);
    process.on('exit', () => fs.rmSync(scratch, {recursive: true, force: true}));
  }
  const output = path.join(scratch, 'result.json');
  fs.rmSync(output, {force: true});
  const args = ['test', './executor/claudecode', '-run', '^' + test + '$', '-count=1'];
  const r = cp.spawnSync('go', args, {cwd: path.join(scratch, 'repo'), env: {...process.env, ADP_INPUT: JSON.stringify(input), ADP_OUTPUT: output}, encoding: 'utf8', timeout: 180000});
  assert.equal(r.status, 0, `${test}: go ${args.join(' ')} failed: ${r.error || ''}${r.stdout}${r.stderr}`);
  assert.ok(fs.existsSync(output), `${test} did not run: go ${args.join(' ')} wrote no capture output\n${r.stdout}`);
  return JSON.parse(fs.readFileSync(output, 'utf8'));
}
function succeeded(a) {
  assert.equal(a.class, '', `${test}: Start class ${a.class} detail ${a.detail}`);
  assert.equal(a.reason, '', `${test}: Start reason ${a.reason} detail ${a.detail}`);
  assert.equal(a.started, 1, `${test}: executor_started count`);
}
function checkedMode(a, mode) {
  assert.equal(a.mode, mode, `${test}: checked directory mode`);
}
function fileModes(a, mode) {
  for (const name of names) {
    assert.equal(a.files[name], true, `${test}: ${name} missing`);
    assert.equal(a.file_modes[name], mode, `${test}: ${name} mode`);
  }
}
function policyPaths(a, log, arg) {
  assert.equal(a.policy_log, log, `${test}: hook policy log`);
  assert.deepEqual(a.policy_args, [arg, arg], `${test}: settings --policy arguments`);
}
function exactKeys(a, want) {
  succeeded(a);
  assert.deepEqual(a.keys, [...want].sort(), `${test}: executor_started keys`);
}
function noTightened(a) {
  succeeded(a);
  assert.equal(a.tightened_present, false, `${test}: artifact_dir_mode_tightened present`);
  assert.equal(a.tightened, null, `${test}: artifact_dir_mode_tightened value`);
}
function tightenedTrue(a) {
  succeeded(a);
  assert.equal(a.tightened_present, true, `${test}: artifact_dir_mode_tightened missing`);
  assert.equal(a.tightened, true, `${test}: artifact_dir_mode_tightened`);
}
function notSymlink(a) {
  assert.equal(a.artifact_symlink, false, `${test}: artifact path is a symlink`);
}
function remainsSymlink(a) {
  assert.equal(a.artifact_symlink, true, `${test}: artifact path is not a symlink`);
}
function refused(a, detail) {
  assert.equal(a.class, 'executor', `${test}: error class`);
  assert.equal(a.reason, 'unavailable', `${test}: error reason ${a.detail}`);
  assert.equal(a.detail, detail, `${test}: error detail`);
  assert.equal(a.started, 0, `${test}: executor_started on refusal`);
  assert.equal(a.tightened_present, false, `${test}: tightened key on refusal`);
  assert.equal(a.tightened, null, `${test}: tightened value on refusal`);
  for (const name of names) assert.equal(a.files[name], false, `${test}: ${name} written on refusal`);
}
function onceRemainsSymlink(a) {
  assert.equal(a.once_symlink, true, `${test}: once-resolved path is not a symlink`);
}
function ultimateUntouched(a, mode) {
  assert.equal(a.ultimate_mode, mode, `${test}: ultimate directory mode`);
  assert.equal(a.ultimate_files, false, `${test}: ultimate directory has hook files`);
}
const plainKeys = ['auth', 'claude_code_version', 'contract', 'effort', 'event', 'executor', 'max_turns', 'model', 'role', 'run_id', 'session_id', 'setting_sources', 'version'];
const tightKeys = [...plainKeys, 'artifact_dir_mode_tightened'];
function controls(bad) {
  const files = {'hook-policy.json': true, 'claude-settings.json': true, 'hook-log.jsonl': true};
  const modes = {'hook-policy.json': '0600', 'claude-settings.json': '0600', 'hook-log.jsonl': '0600'};
  const none = {'hook-policy.json': false, 'claude-settings.json': false, 'hook-log.jsonl': false};
  const plain = {
    class: '', reason: '', detail: '', mode: '0700', artifact_symlink: false,
    files, file_modes: modes,
    policy_log: '$ABS/absent/hook-log.jsonl',
    policy_args: ['$ABS/absent/hook-policy.json', '$ABS/absent/hook-policy.json'],
    started: 1, keys: [...plainKeys].sort(), tightened_present: false, tightened: null,
    once_symlink: false, ultimate_mode: '', ultimate_files: false,
  };
  const tightened = {
    ...structuredClone(plain), mode: '0700',
    policy_log: '$ABS/dir/hook-log.jsonl',
    policy_args: ['$ABS/dir/hook-policy.json', '$ABS/dir/hook-policy.json'],
    keys: [...tightKeys].sort(), tightened_present: true, tightened: true,
  };
  const link = {
    ...structuredClone(tightened), artifact_symlink: true,
    policy_log: '$ABS/target/hook-log.jsonl',
    policy_args: ['$ABS/target/hook-policy.json', '$ABS/target/hook-policy.json'],
  };
  const ownerDetail = 'cannot secure the executor artifact directory $ABS/dir: not owned by this user';
  const chmodDetail = 'cannot secure the executor artifact directory $ABS/dir: cannot change its mode: operation not permitted';
  const hopDetail = 'cannot secure the executor artifact directory $ABS/mid: not a directory';
  const refusedOwner = {
    class: 'executor', reason: 'unavailable', detail: ownerDetail, mode: '0755',
    artifact_symlink: false, files: none, file_modes: {}, policy_log: '', policy_args: [],
    started: 0, keys: [], tightened_present: false, tightened: null,
    once_symlink: false, ultimate_mode: '', ultimate_files: false,
  };
  const hop = {
    ...structuredClone(refusedOwner), detail: hopDetail, mode: '0777', artifact_symlink: true,
    once_symlink: true, ultimate_mode: '0777', ultimate_files: false,
  };
  exactKeys(plain, plainKeys);
  noTightened(plain);
  checkedMode(plain, '0700');
  fileModes(plain, '0600');
  policyPaths(plain, '$ABS/absent/hook-log.jsonl', '$ABS/absent/hook-policy.json');
  notSymlink(plain);
  tightenedTrue(tightened);
  exactKeys(tightened, tightKeys);
  remainsSymlink(link);
  policyPaths(link, '$ABS/target/hook-log.jsonl', '$ABS/target/hook-policy.json');
  refused(refusedOwner, ownerDetail);
  checkedMode(refusedOwner, '0755');
  refused(hop, hopDetail);
  remainsSymlink(hop);
  onceRemainsSymlink(hop);
  ultimateUntouched(hop, '0777');
  refused({...structuredClone(refusedOwner), detail: chmodDetail}, chmodDetail);
  if (!bad) {
    console.log('observer good');
    return;
  }
  const cases = [
    [exactKeys, plain, plainKeys, a => { a.keys = a.keys.filter(k => k !== 'auth'); }],
    [exactKeys, plain, plainKeys, a => { a.keys = [...a.keys, 'artifact_dir_mode_tightened']; }],
    [noTightened, plain, null, a => { a.tightened_present = true; a.tightened = true; }],
    [noTightened, plain, null, a => { a.tightened = false; }],
    [checkedMode, plain, '0700', a => { a.mode = '0755'; }],
    [fileModes, plain, '0600', a => { a.file_modes['hook-policy.json'] = '0644'; }],
    [fileModes, plain, '0600', a => { a.files['hook-log.jsonl'] = false; }],
    [policyPaths, plain, ['$ABS/absent/hook-log.jsonl', '$ABS/absent/hook-policy.json'], a => { a.policy_log = '$ABS/link/hook-log.jsonl'; }],
    [policyPaths, plain, ['$ABS/absent/hook-log.jsonl', '$ABS/absent/hook-policy.json'], a => { a.policy_args = ['$ABS/absent/hook-policy.json']; }],
    [notSymlink, plain, null, a => { a.artifact_symlink = true; }],
    [tightenedTrue, tightened, null, a => { a.tightened = 'true'; }],
    [tightenedTrue, tightened, null, a => { a.tightened_present = false; a.tightened = null; }],
    [exactKeys, tightened, tightKeys, a => { a.keys = a.keys.filter(k => k !== 'artifact_dir_mode_tightened'); }],
    [policyPaths, link, ['$ABS/target/hook-log.jsonl', '$ABS/target/hook-policy.json'], a => { a.policy_log = '$ABS/link/hook-log.jsonl'; a.policy_args = ['$ABS/link/hook-policy.json', '$ABS/link/hook-policy.json']; }],
    [remainsSymlink, link, null, a => { a.artifact_symlink = false; }],
    [refused, refusedOwner, ownerDetail, a => { a.class = ''; }],
    [refused, refusedOwner, ownerDetail, a => { a.reason = 'failed'; }],
    [refused, refusedOwner, ownerDetail, a => { a.detail = 'cannot secure the executor artifact directory: not owned by this user'; }],
    [refused, refusedOwner, ownerDetail, a => { a.started = 1; }],
    [refused, refusedOwner, ownerDetail, a => { a.files['hook-policy.json'] = true; }],
    [refused, refusedOwner, ownerDetail, a => { a.files['claude-settings.json'] = true; }],
    [refused, refusedOwner, ownerDetail, a => { a.tightened_present = true; a.tightened = true; }],
    [ultimateUntouched, hop, '0777', a => { a.ultimate_mode = '0700'; }],
    [ultimateUntouched, hop, '0777', a => { a.ultimate_files = true; }],
    [onceRemainsSymlink, hop, null, a => { a.once_symlink = false; }],
    [refused, hop, hopDetail, a => { a.detail = 'cannot secure the executor artifact directory $ABS/hop-target: not a directory'; }],
    [refused, refusedOwner, chmodDetail, a => { a.detail = ownerDetail; }],
    [checkedMode, refusedOwner, '0755', a => { a.mode = '0700'; }],
  ];
  for (const [check, base, arg, mutate] of cases) {
    const a = structuredClone(base);
    mutate(a);
    let threw = false;
    try {
      if (arg === null) check(a);
      else if (Array.isArray(arg)) check(a, arg[0], arg[1]);
      else check(a, arg);
    } catch (_) {
      threw = true;
    }
    assert.ok(threw, `${test}: mutation not rejected: ${mutate}`);
  }
  console.log('observer bad rejected');
  process.exitCode = 1;
}
if (require.main === module) controls(process.argv[2] === 'bad');
else {
  const {When, Then} = require('@cucumber/cucumber');
  When(prefix + 'Start runs with:', {timeout: 240000}, function(doc) { this.adp = run(JSON.parse(doc)); });
  Then(prefix + 'the checked directory mode is {string}', function(mode) { checkedMode(this.adp, mode); });
  Then(prefix + 'the hook files in the checked directory are mode {string}', function(mode) { fileModes(this.adp, mode); });
  Then(prefix + 'the hook policy log is {string} and each settings policy argument is {string}', function(log, arg) { policyPaths(this.adp, log, arg); });
  Then(prefix + 'the start event has exactly the keys:', function(doc) { exactKeys(this.adp, JSON.parse(doc)); });
  Then(prefix + 'the start event has no artifact_dir_mode_tightened key', function() { noTightened(this.adp); });
  Then(prefix + 'the start event has artifact_dir_mode_tightened true', function() { tightenedTrue(this.adp); });
  Then(prefix + 'the artifact path is not a symlink', function() { notSymlink(this.adp); });
  Then(prefix + 'the artifact path remains a symlink', function() { remainsSymlink(this.adp); });
  Then(prefix + 'Start fails unavailable with detail {string} and writes no hook files', function(detail) { refused(this.adp, detail); });
  Then(prefix + 'the once-resolved path remains a symlink', function() { onceRemainsSymlink(this.adp); });
  Then(prefix + 'the ultimate directory mode is {string} and it has no hook files', function(mode) { ultimateUntouched(this.adp, mode); });
}
