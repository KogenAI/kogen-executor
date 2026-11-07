package claudecode

import (
	"context"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

// An interrupted sign-in is still the run failure, unavailable and with the retry command.
func TestSetupTokenInterruptedIsRunFailure(t *testing.T) {
	if _, ok := Supported(); !ok {
		t.Skip("unsupported platform")
	}
	home := t.TempDir()
	if err := os.MkdirAll(RuntimeDir(home), 0o700); err != nil {
		t.Fatal(err)
	}
	writeStandIn(t, RuntimePath(home), "#!/bin/sh\nexec sleep 30\n", 0o755)
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	token, err := SetupToken(ctx, home, nil)
	if token != "" {
		t.Fatalf("token %q", token)
	}
	e, ok := sys.AsError(err)
	if !ok || e.Class+"/"+e.Reason != "executor/unavailable" ||
		!strings.HasPrefix(e.Detail, "Kogen's Claude Code `setup-token` failed: ") || !strings.HasSuffix(e.Detail, setupTokenRetry) {
		t.Fatalf("error is %v", err)
	}
}

func TestParseSetupToken(t *testing.T) {
	for _, c := range []struct{ name, in, want string }{
		{"plain", "x\nYour OAuth token (valid for 1 year):\n\nsk-ant-abc_1\n\nStore this token securely.\n", "sk-ant-abc_1"},
		{"wrapped with escapes", " Your OAuth token (valid for 1 year):\r\n\n \x1b[1msk-ant-\x1b[22m\n \x1b]8;;http://x\x07TOKEN-1\x1b]8;;\x1b\\\n Store this token securely.\n", "sk-ant-TOKEN-1"},
		{"no blank before the store line", "Your OAuth token:\ntok-1\nStore this token securely.\n", "tok-1"},
		{"no marker", "sk-ant-abc\n", ""},
		{"unparsable", "Your OAuth token:\n\nnot a token\n", ""},
		{"nothing after", "Your OAuth token:\n", ""},
	} {
		if got := parseSetupToken(c.in); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestTokenScreenHoldsBackTheMarker(t *testing.T) {
	var out strings.Builder
	var mu sync.Mutex
	var captured limitedBuffer
	s := &tokenScreen{mu: &mu, out: &out, captured: &captured}
	for _, p := range []string{"prompt > Your OAuth ", "tok", "en (valid):\n\nSECRET\n"} {
		s.Write([]byte(p))
	}
	s.flush()
	if out.String() != "prompt > " {
		t.Fatalf("out is %q", out.String())
	}
	s = &tokenScreen{mu: &mu, out: &out, captured: &captured}
	out.Reset()
	s.Write([]byte("end Your OAuth"))
	s.flush()
	if out.String() != "end Your OAuth" {
		t.Fatalf("out is %q", out.String())
	}
}
