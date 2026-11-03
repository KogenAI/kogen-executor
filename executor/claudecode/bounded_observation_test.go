package claudecode

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestTargetObservationLimit(t *testing.T) {
	for _, size := range []int64{maxTargetDigest - 1, maxTargetDigest, maxTargetDigest + 1} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			p := filepath.Join(t.TempDir(), "target")
			f, err := os.Create(p)
			if err != nil {
				t.Fatal(err)
			}
			if err = f.Truncate(size); err != nil {
				t.Fatal(err)
			}
			if err = f.Close(); err != nil {
				t.Fatal(err)
			}
			target := observePath(p)
			if target.observable != (size <= maxTargetDigest) || target.unchanged() != (size <= maxTargetDigest) {
				t.Fatalf("size %d: %+v", size, target)
			}
		})
	}
}

func TestSentinelIncrementalPartialAndLast(t *testing.T) {
	p := filepath.Join(t.TempDir(), "log")
	var log sentinelLog
	appendLog := func(s string) {
		t.Helper()
		f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = f.WriteString(s); err != nil {
			t.Fatal(err)
		}
		if err = f.Close(); err != nil {
			t.Fatal(err)
		}
	}
	appendLog("{\"hook\":\"pretool\",\"nonce\":\"mine\",\"tool_use_id\":\"x\",\"decision\":\"allow\"}\n{\"hook\":\"pretool\",")
	records, err := log.read(p, "mine")
	if err != nil || records["x"].Decision != "allow" {
		t.Fatalf("first: %v %v", records, err)
	}
	appendLog("\"nonce\":\"mine\",\"tool_use_id\":\"x\",\"decision\":\"deny\"}\n{\"hook\":\"pretool\",\"nonce\":\"stale\",\"tool_use_id\":\"x\",\"decision\":\"allow\"}\n")
	records, err = log.read(p, "mine")
	if err != nil || records["x"].Decision != "deny" {
		t.Fatalf("second: %v %v", records, err)
	}
}
