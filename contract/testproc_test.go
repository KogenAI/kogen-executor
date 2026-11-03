package contract_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/KogenAI/kogen-executor/testproc"
)

// markEnv names the marker file the isolated child writes: the parent sets it before it forks
// the child, which inherits it.
const markEnv = "KOGEN_CONTRACT_ISOLATE_MARK"

func TestIsolate(t *testing.T) {
	const src = "(kogen-build baseline_cache_test.go; kogen-shaping shape/helper_test.go)"
	mark := os.Getenv(markEnv)
	parent := mark == ""
	if parent {
		mark = filepath.Join(t.TempDir(), "ran-in-child")
		os.Setenv(markEnv, mark)
		t.Cleanup(func() { os.Unsetenv(markEnv) })
	}
	if !testproc.Isolate(t, "KOGEN_CONTRACT_ISOLATE=applied") {
		// The parent returns false after the child passed; the child must not.
		if !parent {
			t.Fatalf("testproc.Isolate returned false in the child %s", src)
		}
		if _, err := os.Stat(mark); err != nil {
			t.Errorf("the child did not run the test body after Isolate returned true %s: %v", src, err)
		}
		return
	}
	if parent {
		t.Fatalf("testproc.Isolate returned true in the parent %s", src)
	}
	eq(t, "testproc.Isolate applies the KEY=value environment in the child "+src, os.Getenv("KOGEN_CONTRACT_ISOLATE"), "applied")
	if err := os.WriteFile(mark, nil, 0o600); err != nil {
		t.Fatal(err)
	}
}
