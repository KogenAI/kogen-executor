package claudecode

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
)

func TestLargeTokenPreflightRefusedBeforeStart(t *testing.T) {
	dir := t.TempDir()
	marker := filepath.Join(dir, "started")
	bin := filepath.Join(dir, "child")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\necho started > "+marker+"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	token := strings.Repeat("SYNTHETIC-token-transport ", 65536)
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	a := New(Options{Token: token}).(*adapter)
	start := time.Now()
	out, err := a.run(ctx, bin, nil, token)
	if err == nil || time.Since(start) > 3*time.Second {
		t.Fatal("large token was not refused promptly")
	}
	if strings.Contains(err.Error(), token) || strings.Contains(string(out), token) {
		t.Fatal("token disclosed")
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("child started before refusal")
	}
}

func TestRoundTokenTransport(t *testing.T) {
	for _, tc := range []struct{ name, token string }{
		{"large", strings.Repeat("SYNTHETIC-token-transport ", 65536)},
		{"short", "SYNTHETIC-token-transport short\n \n"},
		{"empty", ""},
	} {
		for _, mode := range []string{"read", "never", "missing"} {
			t.Run(tc.name+"/"+mode, func(t *testing.T) {
				dir := t.TempDir()
				marker := filepath.Join(dir, "started")
				bin := filepath.Join(dir, "child")
				if mode != "missing" {
					script := "#!/bin/sh\necho $$ > " + marker + "\n"
					if mode == "never" {
						script += "exec sleep 60\n"
					} else {
						script += "if [ \"$CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR\" = 3 ]; then cat <&3 > " + filepath.Join(dir, "token") + "; fi\n"
					}
					if err := os.WriteFile(bin, []byte(script), 0700); err != nil {
						t.Fatal(err)
					}
				}
				a := New(Options{Token: tc.token, KillGrace: 10 * time.Millisecond}).(*adapter)
				s := &session{a: a, task: executor.Task{}, emit: func(map[string]any) {}, bin: bin, env: a.childEnv("", tc.token), root: dir, dir: dir, role: executor.RoleBuild}
				ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
				defer cancel()
				start := time.Now()
				_, err := s.Round(ctx, executor.Input{})
				if time.Since(start) > 3*time.Second {
					t.Fatal("round did not return promptly")
				}
				if err == nil {
					t.Fatal("fake does not emit a valid round")
				}
				if tc.token != "" && strings.Contains(err.Error(), tc.token) {
					t.Fatal("token disclosed")
				}
				_, statErr := os.Stat(marker)
				if tc.name == "large" || mode == "missing" {
					if !os.IsNotExist(statErr) {
						t.Fatal("child started unexpectedly")
					}
					return
				}
				if statErr != nil {
					t.Fatal("child did not start", statErr)
				}
				pidBytes, e := os.ReadFile(marker)
				pid, parseErr := strconv.Atoi(strings.TrimSpace(string(pidBytes)))
				if e != nil || parseErr != nil || syscall.Kill(pid, 0) != syscall.ESRCH {
					t.Fatal("owned child remains", e, parseErr)
				}
				if mode == "never" {
					wantError(t, err, "executor/deadline")
					return
				}
				if tc.token != "" {
					b, e := os.ReadFile(filepath.Join(dir, "token"))
					if e != nil || string(b) != tc.token {
						t.Fatal("private token bytes differ", e)
					}
				}
			})
		}
	}
}

func TestRoundShortAndEmptyTokenDelivery(t *testing.T) {
	for _, token := range []string{"SYNTHETIC-token-transport short\n \n", ""} {
		name := "short"
		if token == "" {
			name = "empty"
		}
		t.Run(name, func(t *testing.T) {
			cfg := fakeConfig{Script: oneRound(finishRound)}
			if token != "" {
				cfg.Auth = `{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}`
				cfg.Init = tokenInitEvent
			}
			h := newHarness(t, cfg)
			opts := h.f.options()
			opts.Token = token
			s, err := h.start(opts)
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			if _, err := s.Round(context.Background(), executor.Input{}); err != nil {
				t.Fatal(err)
			}
			b, err := os.ReadFile(filepath.Join(h.f.cfg.State, "fd3-1"))
			if err != nil || string(b) != token {
				t.Fatal("round token differs", err)
			}
		})
	}
}

func TestTokenTransportSizeBoundary(t *testing.T) {
	for _, size := range []int{511, 512, 513} {
		t.Run(strconv.Itoa(size), func(t *testing.T) {
			dir := t.TempDir()
			output := filepath.Join(dir, "token")
			bin := filepath.Join(dir, "child")
			if err := os.WriteFile(bin, []byte("#!/bin/sh\ncat <&3 > "+output+"\n"), 0700); err != nil {
				t.Fatal(err)
			}
			token := strings.Repeat("x", size)
			a := New(Options{Token: token}).(*adapter)
			ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
			defer cancel()
			_, err := a.run(ctx, bin, nil, token)
			if size > 512 {
				if err == nil || strings.Contains(err.Error(), token) {
					t.Fatal("oversize token was not safely refused")
				}
				if _, err := os.Stat(output); !os.IsNotExist(err) {
					t.Fatal("child started for oversize token")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			b, err := os.ReadFile(output)
			if err != nil || string(b) != token {
				t.Fatal("token bytes differ", err)
			}
		})
	}
}
