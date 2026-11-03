// Package golden is the one update path of the golden-file tests. It registers the test flag
// -update, so that "go test ./... -update" is accepted by every package with tests, and writes
// the goldens in one format. Only _test.go files import it, so the flag never reaches the
// kogen program.
package golden

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"testing"
)

var update = flag.Bool("update", false, "rewrite the golden files from the current output")

// Update reports whether the tests were run with -update.
func Update() bool { return *update }

// WriteJSON writes v to path as two-space-indented JSON with sorted object keys, unescaped
// HTML characters and exactly one final newline.
func WriteJSON(t testing.TB, path string, v any) {
	t.Helper()
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}
