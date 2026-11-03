package main

import (
	"context"
	"encoding/json"
	"fmt"
	ex "github.com/KogenAI/kogen-executor/executor"
	cc "github.com/KogenAI/kogen-executor/executor/claudecode"
	"os"
	"path/filepath"
	"strings"
)

func must(e error) {
	if e != nil {
		panic(e)
	}
}
func main() {
	mode := os.Args[1]
	h, e := os.MkdirTemp("", "runtime-cache-")
	must(e)
	defer os.RemoveAll(h)
	p := cc.RuntimePath(h)
	must(os.MkdirAll(filepath.Dir(p), 0700))
	log := filepath.Join(h, "calls")
	script := func(v string) []byte {
		return []byte(fmt.Sprintf("#!/bin/sh\ncase \"$1\" in\n--version) echo '%s (Claude Code)';;\nauth) echo auth >> '%s'; echo '{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"apiProvider\":\"firstParty\"}';;\n*) echo task >> '%s'; exit 1;;\nesac\n", v, log, log))
	}
	must(os.WriteFile(p, script(cc.Version), 0755))
	a := cc.New(cc.Options{Home: h, HookCommand: []string{"unused"}})
	initial := a.Describe().Version
	switch mode {
	case "rename":
		must(os.WriteFile(p+".new", script("0.0.0"), 0755))
		must(os.Rename(p+".new", p))
	case "rewrite":
		must(os.WriteFile(p, script("0.0.0"), 0755))
	case "missing":
		must(os.Remove(p))
	case "unchanged", "cancel":
	default:
		panic(mode)
	}
	// Observe missing without Start's deliberate installer. No download can occur.
	observed := a.Describe().Version
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if mode == "cancel" {
		cancel()
	}
	events := 0
	var startErr error
	started := false
	if mode != "missing" {
		s, err := a.Start(ctx, ex.Task{Role: ex.RoleBuild, Schema: json.RawMessage(`{}`), Root: h, Dir: filepath.Join(h, "artifacts")}, func(m map[string]any) {
			if m["event"] == "executor_started" {
				events++
			}
		})
		startErr = err
		started = s != nil
	}
	reason := "none"
	if startErr != nil {
		reason = "other"
		if strings.Contains(startErr.Error(), "executor/unavailable") {
			reason = "unavailable"
		}
		if strings.Contains(startErr.Error(), "executor/interrupted") {
			reason = "interrupted"
		}
	}
	diagnostic := false
	if startErr != nil {
		diagnostic = strings.Contains(startErr.Error(), "0.0.0 (Claude Code)")
	}
	calls, _ := os.ReadFile(log)
	must(json.NewEncoder(os.Stdout).Encode(map[string]any{"initial": initial, "observed": observed, "started": started, "reason": reason, "replacementDiagnostic": diagnostic, "auth": strings.Count(string(calls), "auth\n"), "task": strings.Count(string(calls), "task\n"), "events": events}))
}
