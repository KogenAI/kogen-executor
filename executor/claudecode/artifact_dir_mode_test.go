package claudecode

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/testproc"
)

func TestArtifactDirPrivateMode(t *testing.T) {
	if !testproc.Isolate(t) {
		return
	}

	t.Run("created", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		h.startOK()
		assertArtifactDir(t, h, h.task.Dir, 0o700, false)
		assertNotSymlink(t, h.task.Dir)
	})

	t.Run("created ignores seams", func(t *testing.T) {
		t.Setenv(artifactDirForeignOwner, "1")
		t.Setenv(artifactDirChmodFail, "1")
		h := newHarness(t, fakeConfig{})
		h.startOK()
		assertArtifactDir(t, h, h.task.Dir, 0o700, false)
		assertNotSymlink(t, h.task.Dir)
	})

	for _, mode := range []os.FileMode{0o755, 0o750, 0o707} {
		t.Run(fmt.Sprintf("tighten %04o", mode), func(t *testing.T) {
			h := newHarness(t, fakeConfig{})
			dir := filepath.Join(t.TempDir(), "dir")
			mustMkdir(t, dir, mode)
			h.task.Dir = dir
			h.startOK()
			assertArtifactDir(t, h, dir, 0o700, true)
			assertNotSymlink(t, dir)
			assertPolicyPaths(t, dir, dir)
		})
	}

	t.Run("owner-only", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		dir := filepath.Join(t.TempDir(), "dir")
		mustMkdir(t, dir, 0o700)
		h.task.Dir = dir
		h.startOK()
		assertArtifactDir(t, h, dir, 0o700, false)
		assertNotSymlink(t, dir)
		assertPolicyPaths(t, dir, dir)
	})

	t.Run("chmod seam ignored on owner-only", func(t *testing.T) {
		t.Setenv(artifactDirChmodFail, "1")
		h := newHarness(t, fakeConfig{})
		dir := filepath.Join(t.TempDir(), "dir")
		mustMkdir(t, dir, 0o700)
		h.task.Dir = dir
		h.startOK()
		assertArtifactDir(t, h, dir, 0o700, false)
		assertPolicyPaths(t, dir, dir)
	})

	for _, mode := range []os.FileMode{0o755, 0o700} {
		t.Run(fmt.Sprintf("foreign %04o", mode), func(t *testing.T) {
			t.Setenv(artifactDirForeignOwner, "1")
			h := newHarness(t, fakeConfig{})
			dir := filepath.Join(t.TempDir(), "dir")
			mustMkdir(t, dir, mode)
			abs, err := filepath.Abs(dir)
			if err != nil {
				t.Fatal(err)
			}
			h.task.Dir = dir
			_, err = h.start(h.f.options())
			assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": not owned by this user")
			assertNoStart(t, h)
			assertNoHookFiles(t, dir)
			assertPerm(t, dir, mode)
			assertNotSymlink(t, dir)
		})
	}

	t.Run("chmod fail", func(t *testing.T) {
		t.Setenv(artifactDirChmodFail, "1")
		h := newHarness(t, fakeConfig{})
		dir := filepath.Join(t.TempDir(), "dir")
		mustMkdir(t, dir, 0o755)
		abs, err := filepath.Abs(dir)
		if err != nil {
			t.Fatal(err)
		}
		h.task.Dir = dir
		_, err = h.start(h.f.options())
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": cannot change its mode: operation not permitted")
		assertNoStart(t, h)
		assertNoHookFiles(t, dir)
		assertPerm(t, dir, 0o755)
	})

	t.Run("owner seam before chmod seam", func(t *testing.T) {
		t.Setenv(artifactDirForeignOwner, "1")
		t.Setenv(artifactDirChmodFail, "1")
		h := newHarness(t, fakeConfig{})
		dir := filepath.Join(t.TempDir(), "dir")
		mustMkdir(t, dir, 0o755)
		abs, err := filepath.Abs(dir)
		if err != nil {
			t.Fatal(err)
		}
		h.task.Dir = dir
		_, err = h.start(h.f.options())
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": not owned by this user")
		assertNoStart(t, h)
		assertNoHookFiles(t, dir)
		assertPerm(t, dir, 0o755)
	})

	t.Run("symlink tightened and used", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		target := filepath.Join(root, "target")
		mustMkdir(t, target, 0o777)
		link := filepath.Join(root, "link")
		if err := os.Symlink("target", link); err != nil {
			t.Fatal(err)
		}
		h.task.Dir = link
		h.startOK()
		assertArtifactDir(t, h, target, 0o700, true)
		assertPolicyPaths(t, target, target)
		assertRemainsSymlink(t, link, "target")
	})

	t.Run("symlink foreign", func(t *testing.T) {
		t.Setenv(artifactDirForeignOwner, "1")
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		target := filepath.Join(root, "target")
		mustMkdir(t, target, 0o755)
		link := filepath.Join(root, "link")
		if err := os.Symlink("target", link); err != nil {
			t.Fatal(err)
		}
		abs, err := filepath.Abs(target)
		if err != nil {
			t.Fatal(err)
		}
		h.task.Dir = link
		_, err = h.start(h.f.options())
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": not owned by this user")
		assertNoStart(t, h)
		assertNoHookFiles(t, target)
		assertPerm(t, target, 0o755)
		assertRemainsSymlink(t, link, "target")
	})

	t.Run("two-hop refused", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		ultimate := filepath.Join(root, "hop-target")
		mustMkdir(t, ultimate, 0o777)
		mid := filepath.Join(root, "mid")
		if err := os.Symlink("hop-target", mid); err != nil {
			t.Fatal(err)
		}
		hop := filepath.Join(root, "hop")
		if err := os.Symlink("mid", hop); err != nil {
			t.Fatal(err)
		}
		abs, err := filepath.Abs(mid)
		if err != nil {
			t.Fatal(err)
		}
		h.task.Dir = hop
		_, err = h.start(h.f.options())
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": not a directory")
		assertNoStart(t, h)
		assertRemainsSymlink(t, hop, "mid")
		assertRemainsSymlink(t, mid, "hop-target")
		assertPerm(t, ultimate, 0o777)
		assertNoHookFiles(t, ultimate)
		assertNoHookFiles(t, mid)
		assertNoHookFiles(t, hop)
	})

	t.Run("parent symlink spelling", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		exec := filepath.Join(root, "real", "exec")
		mustMkdir(t, exec, 0o700)
		if err := os.Symlink("real", filepath.Join(root, "parent-link")); err != nil {
			t.Fatal(err)
		}
		given := filepath.Join(root, "parent-link", "exec")
		h.task.Dir = given
		h.startOK()
		assertArtifactDir(t, h, given, 0o700, false)
		assertPolicyPaths(t, given, given)
		assertNotSymlink(t, given)
		if _, err := os.Lstat(filepath.Join(root, "parent-link")); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("absolute symlink is used", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		target := filepath.Join(root, "target")
		mustMkdir(t, target, 0o777)
		link := filepath.Join(root, "link")
		if err := os.Symlink(target, link); err != nil {
			t.Fatal(err)
		}
		h.task.Dir = link
		h.startOK()
		assertArtifactDir(t, h, target, 0o700, true)
		assertPolicyPaths(t, target, target)
		assertRemainsSymlink(t, link, target)
	})

	t.Run("absolute symlink keeps target spelling", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		exec := filepath.Join(root, "real", "exec")
		mustMkdir(t, exec, 0o755)
		if err := os.Symlink("real", filepath.Join(root, "parent-link")); err != nil {
			t.Fatal(err)
		}
		via := filepath.Join(root, "parent-link", "exec")
		link := filepath.Join(root, "link")
		if err := os.Symlink(via, link); err != nil {
			t.Fatal(err)
		}
		h.task.Dir = link
		h.startOK()
		assertArtifactDir(t, h, via, 0o700, true)
		assertPolicyPaths(t, via, via)
		assertRemainsSymlink(t, link, via)
		got, err := filepath.EvalSymlinks(via)
		if err != nil || got == via {
			t.Fatalf("fixture did not distinguish spelling: %s %v", got, err)
		}
	})

	t.Run("absolute dangling symlink", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		missing := filepath.Join(root, "missing")
		link := filepath.Join(root, "link")
		if err := os.Symlink(missing, link); err != nil {
			t.Fatal(err)
		}
		h.task.Dir = link
		_, err := h.start(h.f.options())
		abs, aerr := filepath.Abs(missing)
		if aerr != nil {
			t.Fatal(aerr)
		}
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": not a directory")
		assertNoStart(t, h)
		assertRemainsSymlink(t, link, missing)
		if _, statErr := os.Lstat(missing); !os.IsNotExist(statErr) {
			t.Fatalf("missing path was created: %v", statErr)
		}
	})

	t.Run("absolute two-hop refused", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		ultimate := filepath.Join(root, "hop-target")
		mustMkdir(t, ultimate, 0o777)
		mid := filepath.Join(root, "mid")
		if err := os.Symlink(ultimate, mid); err != nil {
			t.Fatal(err)
		}
		hop := filepath.Join(root, "hop")
		if err := os.Symlink(mid, hop); err != nil {
			t.Fatal(err)
		}
		h.task.Dir = hop
		_, err := h.start(h.f.options())
		abs, aerr := filepath.Abs(mid)
		if aerr != nil {
			t.Fatal(aerr)
		}
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": not a directory")
		assertNoStart(t, h)
		assertRemainsSymlink(t, hop, mid)
		assertRemainsSymlink(t, mid, ultimate)
		assertPerm(t, ultimate, 0o777)
		assertNoHookFiles(t, ultimate)
	})

	t.Run("empty dir refused", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		h.task.Dir = ""
		_, err := h.start(h.f.options())
		assertUnavailable(t, err, "no executor artifact directory was given")
		assertNoStart(t, h)
	})

	t.Run("symlink to a file", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		file := filepath.Join(root, "file")
		if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		link := filepath.Join(root, "link")
		if err := os.Symlink("file", link); err != nil {
			t.Fatal(err)
		}
		h.task.Dir = link
		_, err := h.start(h.f.options())
		abs, aerr := filepath.Abs(file)
		if aerr != nil {
			t.Fatal(aerr)
		}
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": not a directory")
		assertNoStart(t, h)
		assertRemainsSymlink(t, link, "file")
		b, readErr := os.ReadFile(file)
		if readErr != nil || string(b) != "x" {
			t.Fatalf("file changed: %q %v", b, readErr)
		}
	})

	t.Run("dangling relative symlink", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		root := t.TempDir()
		missing := filepath.Join(root, "missing")
		link := filepath.Join(root, "link")
		if err := os.Symlink("missing", link); err != nil {
			t.Fatal(err)
		}
		h.task.Dir = link
		_, err := h.start(h.f.options())
		abs, aerr := filepath.Abs(missing)
		if aerr != nil {
			t.Fatal(aerr)
		}
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": not a directory")
		assertNoStart(t, h)
		assertRemainsSymlink(t, link, "missing")
	})

	t.Run("empty seams do not fire", func(t *testing.T) {
		t.Setenv(artifactDirForeignOwner, "")
		t.Setenv(artifactDirChmodFail, "")
		h := newHarness(t, fakeConfig{})
		dir := filepath.Join(t.TempDir(), "dir")
		mustMkdir(t, dir, 0o755)
		h.task.Dir = dir
		h.startOK()
		assertArtifactDir(t, h, dir, 0o700, true)
	})

	t.Run("real chmod error", func(t *testing.T) {
		if _, err := exec.LookPath("chflags"); err != nil {
			t.Skip(err)
		}
		h := newHarness(t, fakeConfig{})
		dir := filepath.Join(t.TempDir(), "dir")
		mustMkdir(t, dir, 0o755)
		out, err := exec.Command("chflags", "uchg", dir).CombinedOutput()
		if err != nil {
			t.Skipf("%v %s", err, out)
		}
		t.Cleanup(func() { _ = exec.Command("chflags", "nouchg", dir).Run() })
		chmodErr := os.Chmod(dir, 0o700)
		if chmodErr == nil {
			t.Fatal("chmod succeeded on an immutable directory")
		}
		abs, aerr := filepath.Abs(dir)
		if aerr != nil {
			t.Fatal(aerr)
		}
		h.task.Dir = dir
		_, err = h.start(h.f.options())
		assertUnavailable(t, err, "cannot secure the executor artifact directory "+abs+": cannot change its mode: "+chmodErr.Error())
		assertNoStart(t, h)
		assertPerm(t, dir, 0o755)
		assertNoHookFiles(t, dir)
	})

	t.Run("mkdirall failure keeps the create sentence", func(t *testing.T) {
		h := newHarness(t, fakeConfig{})
		parent := filepath.Join(t.TempDir(), "noperm")
		if err := os.Mkdir(parent, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(parent, 0o500); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Chmod(parent, 0o700) })
		child := filepath.Join(parent, "child")
		h.task.Dir = child
		_, err := h.start(h.f.options())
		e := wantError(t, err, "executor/"+executor.ReasonUnavailable)
		if !strings.HasPrefix(e.Detail, "cannot create the executor artifact directory: ") || strings.Contains(e.Detail, "cannot secure") {
			t.Fatal(e.Detail)
		}
		assertNoStart(t, h)
		if _, statErr := os.Lstat(child); !os.IsNotExist(statErr) {
			t.Fatalf("child was created: %v", statErr)
		}
	})
}

func TestArtifactDirSpecialBits(t *testing.T) {
	dir := t.TempDir()
	if err := os.Chmod(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	before, err := os.Lstat(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, bit := range []os.FileMode{os.ModeSetuid, os.ModeSetgid, os.ModeSticky} {
		got, tightened, err := ownAndTightenArtifactDir(dir, statFileInfo{mode: os.ModeDir | 0o700 | bit, sys: before.Sys()})
		if err != nil || tightened || got != dir {
			t.Fatalf("bit %o: dir %q tightened %v err %v", bit, got, tightened, err)
		}
	}
	after, err := os.Lstat(dir)
	if err != nil || after.Mode() != before.Mode() {
		t.Fatalf("mode %v became %v (%v)", before.Mode(), after.Mode(), err)
	}
}

func TestArtifactDirOwnerStat(t *testing.T) {
	dir := t.TempDir()
	if err := os.Chmod(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv(artifactDirForeignOwner, "")
	t.Setenv(artifactDirChmodFail, "1")
	_, _, err := ownAndTightenArtifactDir(dir, statFileInfo{mode: os.ModeDir | 0o755, sys: &syscall.Stat_t{Uid: uint32(os.Getuid()) + 1}})
	assertUnavailable(t, err, "cannot secure the executor artifact directory "+dir+": not owned by this user")
	assertPerm(t, dir, 0o755)
	_, _, err = ownAndTightenArtifactDir(dir, statFileInfo{mode: os.ModeDir | 0o755, sys: nil})
	assertUnavailable(t, err, "cannot secure the executor artifact directory "+dir+": not owned by this user")
	assertPerm(t, dir, 0o755)
}

type statFileInfo struct {
	mode os.FileMode
	sys  any
}

func (statFileInfo) Name() string        { return "dir" }
func (statFileInfo) Size() int64         { return 0 }
func (s statFileInfo) Mode() os.FileMode { return s.mode }
func (statFileInfo) ModTime() time.Time  { return time.Time{} }
func (statFileInfo) IsDir() bool         { return true }
func (s statFileInfo) Sys() any          { return s.sys }

var artifactDirPlainKeys = []string{
	"auth", "claude_code_version", "contract", "effort", "event", "executor",
	"max_turns", "model", "role", "run_id", "session_id", "setting_sources", "version",
}

func mustMkdir(t *testing.T, dir string, mode os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, mode); err != nil {
		t.Fatal(err)
	}
}

func assertPerm(t *testing.T, dir string, mode os.FileMode) {
	t.Helper()
	fi, err := os.Lstat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != mode {
		t.Fatalf("%s mode %04o, want %04o", dir, fi.Mode().Perm(), mode)
	}
}

func assertArtifactDir(t *testing.T, h *harness, dir string, mode os.FileMode, tightened bool) {
	t.Helper()
	assertPerm(t, dir, mode)
	for _, name := range []string{"hook-policy.json", "claude-settings.json", "hook-log.jsonl"} {
		fi, err := os.Lstat(filepath.Join(dir, name))
		if err != nil || fi.Mode()&os.ModeSymlink != 0 || fi.Mode().Perm() != 0o600 {
			t.Fatalf("%s: mode %v err %v", name, fi, err)
		}
	}
	evs := h.eventsNamed("executor_started")
	if len(evs) != 1 {
		t.Fatalf("executor_started count %d", len(evs))
	}
	ev := evs[0]
	var keys []string
	for k := range ev {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	want := append([]string{}, artifactDirPlainKeys...)
	if tightened {
		want = append(want, "artifact_dir_mode_tightened")
	}
	sort.Strings(want)
	if !reflect.DeepEqual(keys, want) {
		t.Fatalf("keys %v, want %v", keys, want)
	}
	v, present := ev["artifact_dir_mode_tightened"]
	if present != tightened {
		t.Fatalf("artifact_dir_mode_tightened present=%v value=%v", present, v)
	}
	if tightened && v != true {
		t.Fatalf("artifact_dir_mode_tightened = %#v, want boolean true", v)
	}
}

func assertPolicyPaths(t *testing.T, filesDir, used string) {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(filesDir, "hook-policy.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pol struct {
		Log string `json:"log"`
	}
	if err := json.Unmarshal(b, &pol); err != nil {
		t.Fatal(err)
	}
	wantLog := filepath.Join(used, "hook-log.jsonl")
	if pol.Log != wantLog {
		t.Fatalf("policy log %s, want %s", pol.Log, wantLog)
	}
	b, err = os.ReadFile(filepath.Join(filesDir, "claude-settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	var settings struct {
		Hooks map[string][]struct {
			Hooks []struct {
				Args []string `json:"args"`
			} `json:"hooks"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal(b, &settings); err != nil {
		t.Fatal(err)
	}
	var args []string
	for _, hookName := range []string{"PreToolUse", "PostToolUse"} {
		for _, group := range settings.Hooks[hookName] {
			for _, hook := range group.Hooks {
				for i := 0; i+1 < len(hook.Args); i++ {
					if hook.Args[i] == "--policy" {
						args = append(args, hook.Args[i+1])
					}
				}
			}
		}
	}
	want := filepath.Join(used, "hook-policy.json")
	if !reflect.DeepEqual(args, []string{want, want}) {
		t.Fatalf("policy args %v, want %s twice", args, want)
	}
}

func assertUnavailable(t *testing.T, err error, detail string) {
	t.Helper()
	e := wantError(t, err, "executor/"+executor.ReasonUnavailable)
	if e.Detail != detail {
		t.Fatalf("detail %q, want %q", e.Detail, detail)
	}
}

func assertNoStart(t *testing.T, h *harness) {
	t.Helper()
	if n := len(h.eventsNamed("executor_started")); n != 0 {
		t.Fatalf("executor_started count %d", n)
	}
}

func assertNoHookFiles(t *testing.T, dir string) {
	t.Helper()
	for _, name := range []string{"hook-policy.json", "claude-settings.json", "hook-log.jsonl"} {
		fi, err := os.Lstat(filepath.Join(dir, name))
		if err == nil {
			t.Fatalf("%s written in %s (mode %v)", name, dir, fi.Mode())
		}
		if !os.IsNotExist(err) {
			t.Fatal(err)
		}
	}
}

func assertNotSymlink(t *testing.T, path string) {
	t.Helper()
	fi, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		t.Fatalf("%s is a symlink", path)
	}
}

func assertRemainsSymlink(t *testing.T, path, target string) {
	t.Helper()
	fi, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("%s is not a symlink", path)
	}
	got, err := os.Readlink(path)
	if err != nil {
		t.Fatal(err)
	}
	if got != target {
		t.Fatalf("%s -> %s, want %s", path, got, target)
	}
}
