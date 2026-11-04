package coordinator_test

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
)

func TestGitConsumption(t *testing.T) {
	d := t.TempDir()
	env := []string{"PATH=" + os.Getenv("PATH"), "HOME=" + d, "GIT_CONFIG_NOSYSTEM=1", "GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.test", "GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.test"}
	cmd := exec.Command("git", "init", "-q", d)
	cmd.Env = env
	if out, e := cmd.CombinedOutput(); e != nil {
		t.Fatalf("agent/git.go init: %s %v", out, e)
	}
	r := git.New(d, env)
	if r.Head() != "" {
		t.Fatal("agent/git.go empty Head")
	}
	if _, e := r.Tree("", nil); e == nil {
		t.Fatal("agent/git.go Tree empty start")
	}
	if e := os.WriteFile(filepath.Join(d, "keep"), []byte("one"), 0600); e != nil {
		t.Fatal(e)
	}
	for _, args := range [][]string{{"add", "keep"}, {"-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-qm", "initial"}} {
		c := exec.Command("git", args...)
		c.Dir = d
		c.Env = env
		if out, e := c.CombinedOutput(); e != nil {
			t.Fatalf("commit %s %v", out, e)
		}
	}
	head := r.Head()
	if len(head) != 40 {
		t.Fatalf("agent/git.go Head: %q", head)
	}
	if e := os.WriteFile(filepath.Join(d, "skip"), []byte("two"), 0600); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(d, "added"), []byte("three"), 0600); e != nil {
		t.Fatal(e)
	}
	tree, e := r.Tree(head, []string{"skip"})
	if e != nil {
		t.Fatal(e)
	}
	result, e := r.Run("ls-tree", "--name-only", tree)
	if e != nil || result.Status != 0 || result.Stdout != "added\nkeep\n" || result.Stderr != "" {
		t.Fatalf("agent/git.go Tree/Run: %+v %v", result, e)
	}
	result, e = r.Run("show", "not-a-revision")
	if e != nil || result.Status == 0 || !strings.Contains(result.Stderr, "not-a-revision") {
		t.Fatalf("agent/git.go failure: %+v %v", result, e)
	}
	if _, e = r.Run("push"); !errors.Is(e, git.ErrForbidden) {
		t.Fatalf("agent/git.go forbidden: %v", e)
	}
}
func TestRoleConsumption(t *testing.T) {
	r := project.Role{Provider: "p", Model: "m", Effort: "e", BaseURL: "u"}
	if r.Provider != "p" || r.Model != "m" || r.Effort != "e" || r.BaseURL != "u" {
		t.Fatal("core/state.go project.Role fields")
	}
}
