package claudecode

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

const preflightLogin = "make a token with `claude setup-token` and save it with `kogen provider login claude-code`"

func preflightScript(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "claude")
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"+body+"\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	return p
}

func preflightRunDetail(t *testing.T, path string) string {
	t.Helper()
	a := New(Options{Home: t.TempDir()}).(*adapter)
	_, err := a.run(context.Background(), path, nil, "", "--version")
	return wantError(t, err, "executor/unavailable").Detail
}

func preflightAuthDetail(t *testing.T, path string) string {
	t.Helper()
	a := New(Options{Home: t.TempDir()}).(*adapter)
	_, err := a.authStatus(context.Background(), path, a.childEnv("", ""))
	return wantError(t, err, "executor/unavailable").Detail
}

func wantDetail(t *testing.T, got, want string) {
	t.Helper()
	if got != want {
		t.Fatalf("detail %q, want %q", got, want)
	}
}

func TestRunFailureNamesExitStatus(t *testing.T) {
	t.Parallel()
	wantDetail(t, preflightRunDetail(t, preflightScript(t, "exit 3")), "`claude --version` failed: exited with status 3")
}

func TestRunFailureKeepsStderrAfterTheStatus(t *testing.T) {
	t.Parallel()
	wantDetail(t, preflightRunDetail(t, preflightScript(t, "echo boom >&2; exit 3")), "`claude --version` failed: exited with status 3; stderr: boom")
}

func TestRunFailureNamesTheSignal(t *testing.T) {
	t.Parallel()
	wantDetail(t, preflightRunDetail(t, preflightScript(t, "kill -9 $$")), "`claude --version` failed: was ended by signal 9 (killed)")
}

func TestRunFailureNamesAStartError(t *testing.T) {
	t.Parallel()
	missing := filepath.Join(t.TempDir(), "missing")
	wantDetail(t, preflightRunDetail(t, missing), "`claude --version` failed: could not start: fork/exec "+missing+": no such file or directory")
}

func TestAuthStatusFailureNamesHowTheChildEnded(t *testing.T) {
	t.Parallel()
	wantDetail(t, preflightAuthDetail(t, preflightScript(t, "echo hidden >&2; exit 2")),
		"`claude auth status --json` failed (exited with status 2); "+preflightLogin)
	wantDetail(t, preflightAuthDetail(t, preflightScript(t, "kill -15 $$")),
		"`claude auth status --json` failed (was ended by signal 15 (terminated)); "+preflightLogin)
}
