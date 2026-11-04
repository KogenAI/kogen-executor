package claudecode

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestPreToolArtifactDir(t *testing.T) {
	t.Parallel()
	h := newHookEnv(t)
	art := filepath.Join(h.root, ".run", "exec")
	if err := os.MkdirAll(art, 0o755); err != nil {
		t.Fatal(err)
	}
	h.symlink(filepath.Join(".run", "exec"), "alias")
	via := filepath.Join(filepath.Dir(h.root), "via")
	if err := os.Symlink(art, via); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(policy{Root: h.root, Protected: []string{"protected/contract.txt"}, Log: h.log, Nonce: "n1", ArtifactDir: art})
	if err := os.WriteFile(h.policy, b, 0o600); err != nil {
		t.Fatal(err)
	}
	reason := "this is the executor artifact directory (" + art + ")"
	for _, tc := range []struct {
		path, want string
	}{
		{filepath.Join(art, "hook-policy.json"), reason},
		{art, reason},
		{filepath.Join(h.root, "alias", "hook-policy.json"), reason},
		{filepath.Join(via, "hook-log.jsonl"), reason},
		{".run/exec/hook-policy.json", reason},
		{filepath.Join(h.root, ".run", "other.txt"), ""},
		{filepath.Join(h.root, ".run", "exec2", "f"), ""},
		{filepath.Join(h.root, "src", "a.go"), ""},
		{filepath.Join(filepath.Dir(h.root), "outside", "f"), "the path is outside the checkout"},
		{filepath.Join(h.root, "protected", "contract.txt"), "this is a protected path (protected/contract.txt)"},
	} {
		allow, got, _ := decide(policyOf(t, h), h.root, tc.path)
		if allow != (tc.want == "") || got != tc.want {
			t.Errorf("%s: allow=%v reason=%q, want %q", tc.path, allow, got, tc.want)
		}
	}
	// The artifact directory outranks .git, and read-only outranks it.
	pol := policyOf(t, h)
	pol.ArtifactDir = h.root
	if _, got, _ := decide(pol, h.root, filepath.Join(h.root, ".git", "config")); got != "this is the executor artifact directory ("+h.root+")" {
		t.Errorf(".git under artifact dir: %q", got)
	}
	pol.ReadOnly = true
	if _, got, _ := decide(pol, h.root, filepath.Join(h.root, "src", "a.go")); got != "this role is read-only: it may not change the checkout" {
		t.Errorf("read-only: %q", got)
	}

	// The hook still appends its sentinel for a denied call.
	code, stdout := h.pre("Write", "file_path", filepath.Join(art, "hook-policy.json"), "t1")
	if code != 0 || stdout == "" {
		t.Fatalf("code=%d stdout=%q", code, stdout)
	}
	ss := h.sentinels()
	if len(ss) != 1 || ss[0].Decision != "deny" || ss[0].Reason != reason {
		t.Fatalf("sentinels: %+v", ss)
	}
}

func policyOf(t *testing.T, h *hookEnv) policy {
	t.Helper()
	b, err := os.ReadFile(h.policy)
	if err != nil {
		t.Fatal(err)
	}
	var p policy
	if err := json.Unmarshal(b, &p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestStartArtifactDirInCheckout(t *testing.T) {
	for _, tc := range []struct {
		name string
		dir  func(root string) string
		in   bool
	}{
		{"inside", func(r string) string { return filepath.Join(r, ".run", "exec") }, true},
		{"checkout", func(r string) string { return r }, true},
		{"parent", func(r string) string { return filepath.Dir(r) }, true},
		{"outside", func(r string) string { return filepath.Join(t.TempDir(), "exec") }, false},
		{"sibling", func(r string) string { return r + "2/exec" }, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t, fakeConfig{})
			root, _ := filepath.EvalSymlinks(h.root)
			h.task.Dir = tc.dir(root)
			h.startOK()
			ev := h.eventsNamed("executor_started")[0]
			v, has := ev["artifact_dir_in_checkout"]
			if has != tc.in || (has && v != true) {
				t.Fatalf("artifact_dir_in_checkout=%v present=%v", v, has)
			}
			b, err := os.ReadFile(filepath.Join(h.task.Dir, "hook-policy.json"))
			if err != nil {
				t.Fatal(err)
			}
			var raw map[string]any
			if err := json.Unmarshal(b, &raw); err != nil {
				t.Fatal(err)
			}
			got, has := raw["artifact_dir"]
			if has != tc.in || (has && got != h.task.Dir) {
				t.Fatalf("artifact_dir=%v present=%v, dir %s", got, has, h.task.Dir)
			}
		})
	}
}
