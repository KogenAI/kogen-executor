package claudecode

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestStartReobservesReplacementWithoutDescribe(t *testing.T) {
	for _, change := range []string{"rename", "rewrite"} {
		t.Run(change, func(t *testing.T) {
			home := t.TempDir()
			path := RuntimePath(home)
			if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
				t.Fatal(err)
			}
			calls := filepath.Join(home, "calls")
			script := func(version string) []byte {
				return []byte("#!/bin/sh\nif [ \"$1\" = --version ]; then echo '" + version + " (Claude Code)'; else echo called >> '" + calls + "'; fi\n")
			}
			if err := os.WriteFile(path, script(Version), 0755); err != nil {
				t.Fatal(err)
			}
			a := New(Options{Home: home, HookCommand: []string{"unused"}})
			if got := a.Describe().Version; got != "claude-code "+Version+" (Claude Code)" {
				t.Fatal(got)
			}
			target := path
			if change == "rename" {
				target += ".new"
			}
			if err := os.WriteFile(target, script("0.0.0"), 0755); err != nil {
				t.Fatal(err)
			}
			if change == "rename" {
				if err := os.Rename(target, path); err != nil {
					t.Fatal(err)
				}
			}
			events := 0
			session, err := a.Start(context.Background(), executor.Task{Role: executor.RoleBuild, Schema: json.RawMessage(`{}`), Root: home, Dir: filepath.Join(home, "artifacts")}, func(map[string]any) { events++ })
			if session != nil {
				session.Close()
				t.Fatal("replacement started")
			}
			detail := wantError(t, err, "executor/unavailable").Detail
			if !strings.Contains(detail, "0.0.0 (Claude Code)") {
				t.Fatalf("diagnostic: %s", detail)
			}
			if events != 0 {
				t.Fatalf("events: %d", events)
			}
			if _, err := os.Stat(calls); !os.IsNotExist(err) {
				t.Fatalf("auth or task invoked: %v", err)
			}
		})
	}
}

func TestDescribeAfterExecutableBecomesUnusable(t *testing.T) {
	home := t.TempDir()
	path := RuntimePath(home)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("#!/bin/sh\necho '"+Version+" (Claude Code)'\n"), 0755); err != nil {
		t.Fatal(err)
	}
	a := New(Options{Home: home})
	if got := a.Describe().Version; got != "claude-code "+Version+" (Claude Code)" {
		t.Fatal(got)
	}
	if err := os.Chmod(path, 0600); err != nil {
		t.Fatal(err)
	}
	if got := a.Describe().Version; got != "claude-code unknown" {
		t.Fatal(got)
	}
}
