package claudecode

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestProtectedClassification(t *testing.T) {
	paths, drops, count, fatal := classifyProtected("/r", []string{"a", "a", "  ", "../x", "/other"})
	if !reflect.DeepEqual(paths, []string{"a", "a"}) || count != 3 || fatal != nil || !reflect.DeepEqual(drops, []protectedDrop{{"  ", "empty"}, {"../x", "outside_checkout"}, {"/other", "outside_checkout"}}) {
		t.Fatalf("paths=%v drops=%v count=%d fatal=%v", paths, drops, count, fatal)
	}
	for _, entry := range []string{".", "..", "/r", "/r/..", "/"} {
		_, _, _, fatal := classifyProtected("/r", []string{entry})
		if fatal == nil || fatal.Entry != entry || fatal.Reason != "root_or_parent" {
			t.Errorf("%q: %v", entry, fatal)
		}
	}
}

func TestProtectedDropBounds(t *testing.T) {
	for _, n := range []int{20, 21, 100} {
		input := make([]string, n)
		for i := range input {
			input[i] = "/outside/" + strings.Repeat("a", 246) + "é"
		}
		_, drops, count, fatal := classifyProtected("/r", input)
		if fatal != nil || count != uint64(n) || len(drops) != 20 {
			t.Fatalf("n=%d count=%d drops=%d fatal=%v", n, count, len(drops), fatal)
		}
		if drops[0].Entry != "/outside/"+strings.Repeat("a", 246) {
			t.Fatalf("bad UTF-8 boundary: %q", drops[0].Entry)
		}
	}
}

func TestProtectedDropInvalidUTF8(t *testing.T) {
	for _, c := range []struct{ name, in, want string }{
		{"invalid byte early in a long entry", "/elsewhere/\xff" + strings.Repeat("a", 300), "/elsewhere/\uFFFD" + strings.Repeat("a", 242)},
		{"leading invalid byte", "\xff/../../x" + strings.Repeat("a", 300), "\uFFFD/../../x" + strings.Repeat("a", 245)},
		{"short entry with many invalid bytes", "/elsewhere/" + strings.Repeat("\xffa", 120), "/elsewhere/" + strings.Repeat("\uFFFDa", 61)},
	} {
		_, drops, _, fatal := classifyProtected("/r", []string{c.in})
		if fatal != nil || len(drops) != 1 || drops[0].Reason != "outside_checkout" {
			t.Fatalf("%s: drops=%v fatal=%v", c.name, drops, fatal)
		}
		got := drops[0].Entry
		if got != c.want || !utf8.ValidString(got) || len(got) > 256 {
			t.Fatalf("%s: got %d bytes %q, want %q", c.name, len(got), got, c.want)
		}
		raw, err := json.Marshal(drops[0])
		if err != nil {
			t.Fatal(err)
		}
		var back protectedDrop
		if err := json.Unmarshal(raw, &back); err != nil || back.Entry != c.want || len(back.Entry) > 256 {
			t.Fatalf("%s: marshalled round trip %d bytes, err=%v", c.name, len(back.Entry), err)
		}
	}
}

func TestProtectedSymlinkedRoot(t *testing.T) {
	abs, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	real := filepath.Join(abs, "real")
	link := filepath.Join(abs, "link")
	for _, d := range []string{filepath.Join(real, "a"), filepath.Join(real, "c"), filepath.Join(abs, "elsewhere")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for link, target := range map[string]string{
		link:                         real,
		filepath.Join(real, "inner"): "c",
		filepath.Join(real, "out"):   filepath.Join(abs, "elsewhere"),
		filepath.Join(abs, "up"):     abs,
		filepath.Join(abs, "sub"):    filepath.Join(real, "c"),
	} {
		if err := os.Symlink(target, link); err != nil {
			t.Fatal(err)
		}
	}
	for entry, want := range map[string]string{
		link + "/a/b.txt":           "a/b.txt",
		link + "/not-yet/created":   "not-yet/created",
		real + "/inner/x":           "inner/x",
		link + "/inner/x":           "inner/x",
		real + "/out/f":             "out/f",
		link + "/out/f":             "out/f",
		abs + "/up/real/a/b.txt":    "a/b.txt",
		abs + "/up/link/a/b.txt":    "a/b.txt",
		abs + "/up/up/real/a/b.txt": "a/b.txt",
		abs + "/sub/x":              "c/x",
	} {
		got, drops, _, fatal := classifyProtected(real, []string{entry})
		if !reflect.DeepEqual(got, []string{want}) || len(drops) != 0 || fatal != nil {
			t.Errorf("%s: got %v drops=%v fatal=%v, want %s", entry, got, drops, fatal, want)
		}
	}
	for _, entry := range []string{abs + "/elsewhere/f", abs + "/nowhere/f"} {
		got, drops, count, fatal := classifyProtected(real, []string{entry})
		if len(got) != 0 || count != 1 || fatal != nil || !reflect.DeepEqual(drops, []protectedDrop{{entry, "outside_checkout"}}) {
			t.Errorf("%s: got %v drops=%v fatal=%v", entry, got, drops, fatal)
		}
	}
	for _, entry := range []string{link, abs + "/up", abs + "/up/link", abs + "/up/real", abs + "/up/up"} {
		if _, _, _, fatal := classifyProtected(real, []string{entry}); fatal == nil || fatal.Entry != entry || fatal.Reason != "root_or_parent" {
			t.Errorf("%s: fatal=%v", entry, fatal)
		}
	}
}
