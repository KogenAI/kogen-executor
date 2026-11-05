package claudecode

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-executor/executor/conformance"
)

// hardLinkOrSkip makes newname a hard link of oldname, or skips the test where the platform
// refuses hard links.
func hardLinkOrSkip(t *testing.T, oldname, newname string) {
	t.Helper()
	if err := os.Link(oldname, newname); err != nil {
		t.Skipf("os.Link(%s, %s) was refused: %v", oldname, newname, err)
	}
}

func (h *hookEnv) writeFile(name, content string) string {
	h.t.Helper()
	p := filepath.Join(h.root, name)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		h.t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		h.t.Fatal(err)
	}
	return p
}

// setPolicy rewrites the hook policy file with p, keeping the environment's root, log and nonce.
func (h *hookEnv) setPolicy(p policy) {
	h.t.Helper()
	p.Root, p.Log, p.Nonce = h.root, h.log, "n1"
	b, _ := json.Marshal(p)
	if err := os.WriteFile(h.policy, b, 0o600); err != nil {
		h.t.Fatal(err)
	}
}

func (h *hookEnv) idsOf(entry, name string) fileID {
	h.t.Helper()
	fi, err := os.Lstat(filepath.Join(h.root, name))
	if err != nil {
		h.t.Fatal(err)
	}
	d, i, _, _ := statID(fi)
	return fileID{Entry: entry, Dev: d, Ino: i}
}

func TestPreToolHardLinkAlias(t *testing.T) {
	t.Parallel()
	const hl = "this is a hard link to a protected path ("
	h := newHookEnv(t, "locked.txt", "guarded", "not-yet.txt")
	h.writeFile("locked.txt", "locked\n")
	h.writeFile("guarded/inner.txt", "inner\n")
	h.writeFile("plain.txt", "plain\n")
	h.writeFile("copy.txt", "locked\n")
	h.writeFile("pair-a.txt", "pair\n")
	abs := func(p string) string { return filepath.Join(h.root, p) }
	hardLinkOrSkip(t, abs("locked.txt"), abs("alias.txt"))
	hardLinkOrSkip(t, abs("pair-a.txt"), abs("pair-b.txt"))
	hardLinkOrSkip(t, abs("guarded/inner.txt"), abs("loose.txt"))
	h.symlink("alias.txt", "via-alias")
	h.symlink("locked.txt", "via-locked")
	outside := filepath.Join(filepath.Dir(h.root), "outside", "far.txt")
	hardLinkOrSkip(t, abs("locked.txt"), outside)
	h.symlink(outside, "via-far")
	// Policy as Start would write it for the entries above, then drift after it was written.
	h.setPolicy(policy{Protected: []string{"locked.txt", "guarded", "not-yet.txt"}, ProtectedIDs: []fileID{
		h.idsOf("locked.txt", "locked.txt"), h.idsOf("guarded", "guarded/inner.txt"),
	}})
	h.writeFile("guarded/fresh.txt", "fresh\n")
	hardLinkOrSkip(t, abs("guarded/fresh.txt"), abs("fresh-link.txt"))
	h.writeFile("not-yet.txt", "late\n")
	hardLinkOrSkip(t, abs("not-yet.txt"), abs("not-yet-link.txt"))

	cases := []struct {
		name string
		path string
		want string // empty: allowed
	}{
		{"alias relative", "alias.txt", hl + "locked.txt)"},
		{"alias absolute", abs("alias.txt"), hl + "locked.txt)"},
		{"unlinked unprotected", "plain.txt", ""},
		{"byte-identical copy", "copy.txt", ""},
		{"unprotected linked pair", "pair-b.txt", ""},
		{"protected own name with several links", "locked.txt", "this is a protected path (locked.txt)"},
		{"link to a file inside a protected directory", "loose.txt", hl + "guarded)"},
		{"symlink to protected file", "via-locked", "this is a protected path (locked.txt)"},
		{"symlink to hard link", "via-alias", hl + "locked.txt)"},
		{"symlink to outside hard link", "via-far", "the path is outside the checkout"},
		{"outside hard link", outside, "the path is outside the checkout"},
		{"link to file created in a protected directory after the policy", "fresh-link.txt", ""},
		{"link to a protected entry created after the policy (rule 2b)", "not-yet-link.txt", hl + "not-yet.txt)"},
	}
	for i, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			id := "toolu_" + string(rune('a'+i))
			code, out := h.pre("Write", "file_path", c.path, id)
			if code != 0 {
				t.Fatalf("exit %d", code)
			}
			recs := h.sentinels()
			last := recs[len(recs)-1]
			if last.ToolUseID != id || last.Hook != "pretool" || last.Nonce != "n1" {
				t.Fatalf("sentinel %+v", last)
			}
			if c.want == "" {
				if out != "" || last.Decision != "allow" || last.Reason != "" {
					t.Fatalf("want allow, got %q %+v", out, last)
				}
				return
			}
			if last.Decision != "deny" || last.Reason != c.want {
				t.Fatalf("sentinel %+v, want deny %q", last, c.want)
			}
			var ans struct {
				H struct {
					Reason string `json:"permissionDecisionReason"`
				} `json:"hookSpecificOutput"`
			}
			if err := json.Unmarshal([]byte(out), &ans); err != nil || ans.H.Reason != "Kogen: "+c.want {
				t.Fatalf("answer %q (%v)", out, err)
			}
		})
	}
}

func TestPreToolHardLinkWithoutProtectedIDs(t *testing.T) {
	t.Parallel()
	h := newHookEnv(t, "locked.txt")
	h.writeFile("locked.txt", "locked\n")
	hardLinkOrSkip(t, filepath.Join(h.root, "locked.txt"), filepath.Join(h.root, "alias.txt"))
	h.pre("Write", "file_path", "alias.txt", "t1")
	if got := h.sentinels(); len(got) != 1 || got[0].Decision != "deny" || got[0].Reason != "this is a hard link to a protected path (locked.txt)" {
		t.Fatalf("sentinels %+v", got)
	}
}

func TestPreToolIdentityOnlyForSeveralLinks(t *testing.T) {
	t.Parallel()
	h := newHookEnv(t, "guarded")
	p := h.writeFile("moved.txt", "x\n")
	// Start recorded this file under guarded; it has since left the directory with one link.
	h.setPolicy(policy{Protected: []string{"guarded"}, ProtectedIDs: []fileID{h.idsOf("guarded", "moved.txt")}})
	h.pre("Write", "file_path", "moved.txt", "t1")
	hardLinkOrSkip(t, p, filepath.Join(h.root, "moved-link.txt"))
	h.pre("Write", "file_path", "moved.txt", "t2")
	h.pre("Write", "file_path", "moved-link.txt", "t3")
	got := h.sentinels()
	if len(got) != 3 || got[0].Decision != "allow" || got[1].Decision != "deny" || got[2].Decision != "deny" ||
		got[1].Reason != "this is a hard link to a protected path (guarded)" {
		t.Fatalf("sentinels %+v", got)
	}
}

func TestStartRecordsProtectedIDs(t *testing.T) {
	t.Parallel()
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
	for name, content := range map[string]string{"guarded/inner.txt": "i\n", "guarded/deep/note.txt": "n\n"} {
		p := filepath.Join(h.root, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	h.task.Protected = []string{conformance.ProtectedPath, "guarded", "missing.txt"}
	h.startOK()
	b, err := os.ReadFile(filepath.Join(h.task.Dir, "hook-policy.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pol policy
	if err := json.Unmarshal(b, &pol); err != nil {
		t.Fatal(err)
	}
	id := func(entry, name string) fileID {
		fi, err := os.Stat(filepath.Join(h.root, name))
		if err != nil {
			t.Fatal(err)
		}
		d, i, _, _ := statID(fi)
		return fileID{Entry: entry, Dev: d, Ino: i}
	}
	want := []fileID{
		id(conformance.ProtectedPath, conformance.ProtectedPath),
		id("guarded", "guarded/deep/note.txt"), id("guarded", "guarded/inner.txt"),
	}
	if !reflect.DeepEqual(pol.ProtectedIDs, want) {
		t.Fatalf("protected_ids %+v, want %+v", pol.ProtectedIDs, want)
	}
}

func TestStartOmitsProtectedIDsWithoutRegularFile(t *testing.T) {
	t.Parallel()
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound)})
	h.task.Protected = []string{"missing.txt"}
	h.startOK()
	b, err := os.ReadFile(filepath.Join(h.task.Dir, "hook-policy.json"))
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["protected_ids"]; ok {
		t.Fatalf("policy has protected_ids: %s", b)
	}
}
