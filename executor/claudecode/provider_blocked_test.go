package claudecode

import (
	"context"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/KogenAI/kogen-executor/executor"
)

const cloudflareText = "Failed to authenticate. API Error: 403 Attention Required! | Cloudflare"

const cloudflareHTML = `Failed to authenticate. API Error: 403 <!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head>` +
	`<body><h1>Sorry, you have been blocked</h1><p>Cloudflare Ray ID: 0123456789abcdef</p></body></html>`

func fastBackoff(t *testing.T) {
	t.Helper()
	old := blockedBackoff
	blockedBackoff = []time.Duration{time.Millisecond, time.Millisecond}
	t.Cleanup(func() { blockedBackoff = old })
}

func cloudflareResult(text string) map[string]any {
	return map[string]any{"is_error": true, "terminal_reason": "api_error", "api_error_status": 403, "result": text}
}

func TestCloudflareChallengeIsRetriedThenProviderBlocked(t *testing.T) {
	fastBackoff(t)
	for name, text := range map[string]string{"text": cloudflareText, "html": cloudflareHTML} {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: cloudflareResult(text)})
			_, err := h.startOK().Round(context.Background(), executor.Input{})
			e := wantError(t, err, "executor/provider_blocked")
			if !strings.Contains(e.Detail, "Cloudflare") || strings.Contains(strings.ToLower(e.Detail), "token") {
				t.Fatalf("detail must name Cloudflare, not the token: %q", e.Detail)
			}
			if calls := h.eventsNamed("executor_round_retry"); len(calls) != len(blockedBackoff) {
				t.Fatalf("retry events: %#v", calls)
			}
			failed := h.eventsNamed("executor_round_failed")
			if len(failed) != 1 || failed[0]["reason"] != "provider_blocked" {
				t.Fatalf("failed events: %#v", failed)
			}
		})
	}
}

func TestCloudflareChallengeRecoversOnRetry(t *testing.T) {
	fastBackoff(t)
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: cloudflareResult(cloudflareText), ResultOn: []int{1, 2}})
	res, err := h.startOK().Round(context.Background(), executor.Input{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Ending != executor.EndFinish {
		t.Fatalf("ending %v", res.Ending)
	}
	if got := len(h.eventsNamed("executor_round_retry")); got != 2 {
		t.Fatalf("retry events: %d", got)
	}
	if got := len(h.eventsNamed("executor_round_ended")); got != 1 {
		t.Fatalf("ended events: %d", got)
	}
}

func TestCloudflareRetryResumesLaterRound(t *testing.T) {
	fastBackoff(t)
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), Result: cloudflareResult(cloudflareText), ResultOn: []int{2}})
	s := h.startOK()
	if _, err := s.Round(context.Background(), executor.Input{}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Round(context.Background(), executor.Input{Feedback: "continue"}); err != nil {
		t.Fatal(err)
	}
	for call := 2; call <= 3; call++ {
		if !slices.Contains(h.f.argv(call), "--resume") {
			t.Fatalf("invocation %d did not resume the session: %v", call, h.f.argv(call))
		}
	}
	if string(h.f.prompt(2)) != string(h.f.prompt(3)) {
		t.Fatal("the retry must send the same feedback prompt")
	}
}

func TestGenuine401StaysAuthRefusedWithoutRetry(t *testing.T) {
	fastBackoff(t)
	h := newHarness(t, fakeConfig{Script: oneRound(finishRound), AuthFail: true})
	_, err := h.startOK().Round(context.Background(), executor.Input{})
	wantError(t, err, "executor/auth_refused")
	if got := len(h.eventsNamed("executor_round_retry")); got != 0 {
		t.Fatalf("a 401 must not be retried: %d retries", got)
	}
}

func TestBlockedBackoffIsBounded(t *testing.T) {
	var total time.Duration
	for _, d := range blockedBackoff {
		total += d
	}
	if len(blockedBackoff)+1 != 3 || total < 2*time.Minute || total > 5*time.Minute {
		t.Fatalf("%d tries over %v", len(blockedBackoff)+1, total)
	}
}
