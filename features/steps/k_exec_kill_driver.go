package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func put(path, text string) { must(os.WriteFile(path, []byte(text), 0600)) }

func pid(root, name string) int {
	b, err := os.ReadFile(filepath.Join(root, name+".pid"))
	if err != nil {
		return 0
	}
	n, _ := strconv.Atoi(string(b))
	return n
}

func running(p int) bool {
	if p <= 0 {
		panic("missing owned pid")
	}
	b, err := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(p)).CombinedOutput()
	if err != nil && len(strings.TrimSpace(string(b))) != 0 {
		panic(fmt.Sprintf("ps failed: %v: %s", err, b))
	}
	s := strings.TrimSpace(string(b))
	return s != "" && !strings.HasPrefix(s, "Z")
}

func fake(root string) {
	_, _ = io.Copy(io.Discard, os.Stdin)
	put(filepath.Join(root, "executor.pid"), strconv.Itoa(os.Getpid()))
	exe, err := os.Executable()
	must(err)
	// An ordinary shell command with redirected output, no group/session escape.
	cmd := exec.Command("/bin/sh", "-c", "exec \"$1\" action \"$2\"", "sh", exe, root)
	null, err := os.OpenFile(os.DevNull, os.O_RDWR, 0)
	must(err)
	defer null.Close()
	cmd.Stdin, cmd.Stdout, cmd.Stderr = null, null, null
	must(cmd.Start())
	_ = cmd.Wait()
	time.Sleep(60 * time.Second)
}

func parent(root, role, mode string) {
	exe, err := os.Executable()
	must(err)
	if mode != "adapter" {
		cmd := exec.Command(exe, "raw-fake", root)
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		must(cmd.Start())
		_ = cmd.Wait()
		return
	}
	home := filepath.Join(root, "home")
	must(os.MkdirAll(claudecode.RuntimeDir(home), 0700))
	must(os.Symlink(exe, claudecode.RuntimePath(home)))
	a := claudecode.New(claudecode.Options{
		Home: home, HookCommand: []string{exe},
		Env: append(os.Environ(), "K_EXEC_ROOT="+root),
	})
	s, err := a.Start(context.Background(), executor.Task{
		Role: role, Root: root, Home: home, Dir: filepath.Join(root, "artifacts"),
		Model: "claude-sonnet-5-5", Effort: "high", RunID: "kill-regression", MaxRounds: 1,
		Schema: []byte(`{"type":"object"}`), Brief: executor.Brief{Stable: "local lifecycle fixture"},
	}, nil)
	must(err)
	defer s.Close()
	_, err = s.Round(context.Background(), executor.Input{})
	panic(fmt.Sprintf("round ended before parent kill: %v", err))
}

func exercise(mode, role string) int {
	root, err := os.MkdirTemp("", "k-exec-kill-")
	must(err)
	defer os.RemoveAll(root)
	put(filepath.Join(root, "app.txt"), "before\n")
	exe, err := os.Executable()
	must(err)
	cmd := exec.Command(exe, "parent", root, role, mode)
	log, err := os.Create(filepath.Join(root, "parent.log"))
	must(err)
	defer log.Close()
	cmd.Stdout, cmd.Stderr = log, log
	must(cmd.Start())
	waited := false
	defer func() {
		if !waited {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
		// Only exact pids/groups created by this fixture, never names/patterns.
		if p := pid(root, "executor"); p > 0 {
			_ = syscall.Kill(-p, syscall.SIGKILL)
			_ = syscall.Kill(p, syscall.SIGKILL)
		}
		if p := pid(root, "action"); p > 0 {
			_ = syscall.Kill(p, syscall.SIGKILL)
		}
	}()
	deadline := time.Now().Add(20 * time.Second)
	for pid(root, "action") == 0 {
		if time.Now().After(deadline) {
			b, _ := os.ReadFile(filepath.Join(root, "parent.log"))
			panic(fmt.Sprintf("action not ready: %s", b))
		}
		time.Sleep(20 * time.Millisecond)
	}
	ep, ap := pid(root, "executor"), pid(root, "action")
	if !running(ep) || !running(ap) {
		panic("fixture must be running before SIGKILL")
	}
	must(cmd.Process.Kill()) // Kill only the adapter owner, not its process group.
	_ = cmd.Wait()
	waited = true
	if mode == "control-good" {
		must(syscall.Kill(-ep, syscall.SIGKILL))
	}
	// Allow bounded asynchronous parent-death cleanup; this is NOT lock ordering proof.
	deadline = time.Now().Add(3 * time.Second)
	for (running(ep) || running(ap)) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	alive := running(ep) || running(ap)
	// Always reach the delayed-write assertion, even if process cleanup already failed.
	time.Sleep(31 * time.Second)
	b, err := os.ReadFile(filepath.Join(root, "app.txt"))
	must(err)
	changed := string(b) != "before\n"
	if alive || changed || running(ep) || running(ap) {
		var failures []string
		if alive || running(ep) || running(ap) {
			failures = append(failures, "live executor or action")
		}
		if changed {
			failures = append(failures, "delayed write")
		}
		fmt.Println("FAIL: " + strings.Join(failures, "; "))
		return 1
	}
	fmt.Println("PASS: executor and action stopped; no delayed write")
	return 0
}

func main() {
	a := os.Args[1:]
	if len(a) > 0 && a[0] == "--version" {
		fmt.Println(claudecode.Version + " (Claude Code)")
		return
	}
	if len(a) > 0 && a[0] == "auth" {
		fmt.Println(`{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}`)
		return
	}
	if len(a) > 0 && a[0] == "-p" {
		fake(os.Getenv("K_EXEC_ROOT"))
		return
	}
	switch a[0] {
	case "action":
		put(filepath.Join(a[1], "action.pid"), strconv.Itoa(os.Getpid()))
		time.Sleep(30 * time.Second)
		put(filepath.Join(a[1], "app.txt"), "after\n")
	case "raw-fake":
		fake(a[1])
	case "parent":
		parent(a[1], a[2], a[3])
	case "adapter":
		os.Exit(exercise("adapter", a[1]))
	case "control-good", "control-bad":
		os.Exit(exercise(a[0], "build"))
	default:
		panic("unknown fixture mode")
	}
}
