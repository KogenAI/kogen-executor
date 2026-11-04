package claudecode

import (
	"reflect"
	"strings"
	"testing"
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
