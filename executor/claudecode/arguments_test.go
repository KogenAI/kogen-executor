package claudecode

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestRejectedBeforeHookKeepsArguments(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "a.txt"), []byte("old\n"), 0o644)
	events, err := preHookRun(t, root, "Edit", `{"file_path":"a.txt","old_string":"old\n","count":1.50}`, true, nil)
	if err != nil || len(events) != 1 {
		t.Fatalf("events %v err %v", events, err)
	}
	b, _ := json.Marshal(events[0]["arguments"])
	if events[0]["rejected_before_hook"] != true || string(b) != `{"count":1.50,"file_path":"a.txt","old_string":"old\n"}` {
		t.Fatalf("event %v arguments %s", events[0], b)
	}
}

func TestArgumentsAreNullWithoutObjectInput(t *testing.T) {
	t.Parallel()
	for _, input := range []string{``, `"text"`, `[1]`, `null`} {
		line := `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash"` + map[bool]string{true: "", false: `,"input":` + input}[input == ""] + `}]}}`
		var events []map[string]any
		r := &roundRun{n: 1, init: true, s: &session{emit: func(e map[string]any) { events = append(events, e) }}}
		if err := r.line([]byte(line)); err != nil {
			t.Fatal(err)
		}
		if err := r.line([]byte(`{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1"}]}}`)); err != nil {
			t.Fatal(err)
		}
		args, has := events[0]["arguments"]
		if len(events) != 1 || !has || args != nil {
			t.Fatalf("input %q: events %v", input, events)
		}
	}
}

func TestToolArgumentsRedactsKnownSecrets(t *testing.T) {
	t.Parallel()
	const token, pat = "plainFAKEvalue99", "ghp_FAKEFAKEFAKEFAKEFAKE00"
	var events []map[string]any
	r := &roundRun{n: 1, init: true, s: &session{emit: func(e map[string]any) { events = append(events, e) }}}
	command := "GITHUB_TOKEN=" + token + " gh api user && echo " + pat
	use, _ := json.Marshal(map[string]any{"type": "assistant", "message": map[string]any{"content": []any{
		map[string]any{"type": "tool_use", "id": "t1", "name": "Bash", "input": map[string]any{"command": command}},
	}}})
	if err := r.line(use); err != nil {
		t.Fatal(err)
	}
	if err := r.line([]byte(`{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1"}]}}`)); err != nil {
		t.Fatal(err)
	}
	got, _ := json.Marshal(events[0])
	want := `"command":"GITHUB_TOKEN=[redacted] gh api user \u0026\u0026 echo [redacted]"`
	if !strings.Contains(string(got), want) || strings.Contains(string(got), token) || strings.Contains(string(got), pat) {
		t.Fatalf("record %s", got)
	}
}

func TestToolArgumentsRedactionRules(t *testing.T) {
	t.Parallel()
	env := []string{"DEPLOY_TOKEN=env-held-FAKE-value-5678", "SHORT_TOKEN=abc1234", "TINY_SECRET=8charsOK", "PATH=/usr/bin"}
	cases := []struct{ in, want string }{
		{"echo env-held-FAKE-value-5678 abc1234 8charsOK", "echo [redacted] abc1234 [redacted]"},
		{"a -----BEGIN RSA PRIVATE KEY-----\nbody\n-----END RSA PRIVATE KEY-----\nb", "a [redacted]\nb"},
		{"a -----BEGIN PRIVATE KEY-----\nbody", "a [redacted]"},
		{"git clone https://kogen:urlFAKEpass@github.com/x.git", "git clone https://kogen:[redacted]@github.com/x.git"},
		{`curl -H "authorization:Bearer abc.def" x`, `curl -H "authorization:[redacted]" x`},
		{"sk-" + strings.Repeat("a", 20) + " sk-" + strings.Repeat("a", 19), "[redacted] sk-" + strings.Repeat("a", 19)},
		{"AKIA" + strings.Repeat("A", 16) + " AKIA" + strings.Repeat("A", 15), "[redacted] AKIA" + strings.Repeat("A", 15)},
		{"xoxb-1-2-abc github_pat_A_1 ghs_abc", "[redacted] [redacted] [redacted]"},
		{"GIT_AUTHOR_NAME=Ana go test -count=1 --short", "GIT_AUTHOR_NAME=Ana go test -count=1 --short"},
		{"export X_SECRET='a b' && run --api-key=k ?password=x&y=1", "export X_SECRET=[redacted] && run --api-key=[redacted] ?password=[redacted]&y=1"},
		{"kubectl create secret generic x --from-literal=password=hunter2 a=b=c", "kubectl create secret generic x --from-literal=password=[redacted] a=b=c"},
		{"helm --set a=1,db.password=x,b=2", "helm --set a=1,db.password=[redacted]"},
		{"mysql --password hunter -h db -p x", "mysql --password [redacted] -h db -p x"},
		{"--token \"a b\" --name v", "--token [redacted] --name v"},
		{"--password -x", "--password -x"},
		{`echo '{"password":"s3cr3tVALUE9x","user":"ana"}'`, `echo '{"password":"[redacted]","user":"ana"}'`},
		{`echo "'password': 's3cr3tVALUE9x', 'user': 'ana'"`, `echo "'password': '[redacted]', 'user': 'ana'"`},
		{`echo "password: s3cr3tVALUE9x" > cfg.yml`, `echo "password: [redacted]" > cfg.yml`},
		{`password: s3cr3tVALUE9x`, `password: [redacted]`},
		{`echo '{"password":"abc\"secret","user":"ana"}'`, `echo '{"password":"[redacted]","user":"ana"}'`},
		{`password: abc; echo ok`, `password: [redacted]; echo ok`},
		{`password: [redacted]secret`, `password: [redacted]`},
		{`curl -u "admin:long secret" h`, `curl -u "admin:[redacted]" h`},
		{`curl --user "admin:abc\"secret" h`, `curl --user "admin:[redacted]" h`},
		{`curl -u admin:secret; echo ok`, `curl -u admin:[redacted]; echo ok`},
		{`curl -H "X-Api-Key: s3cr3tVALUE9x" https://h/x`, `curl -H "X-Api-Key: [redacted]" https://h/x`},
		{`curl -H "Cookie: session=s3cr3tVALUE9x" h`, `curl -H "Cookie: [redacted]" h`},
		{`curl -H "Set-Cookie: session=s3cr3tVALUE9x; Path=/" h`, `curl -H "Set-Cookie: [redacted]" h`},
		{`curl -H "X-Key: s3cr3tVALUE9x" -H "X-Token: s3cr3tVALUE9x" -H "X-Secret: s3cr3tVALUE9x" -H "X-Auth: s3cr3tVALUE9x" h`, `curl -H "X-Key: [redacted]" -H "X-Token: [redacted]" -H "X-Secret: [redacted]" -H "X-Auth: [redacted]" h`},
		{`curl -u admin:s3cr3tVALUE9x https://h/x`, `curl -u admin:[redacted] https://h/x`},
		{`curl --user admin:s3cr3tVALUE9x https://h/x`, `curl --user admin:[redacted] https://h/x`},
		{`tool --secret=\"s3cr3tVALUE9x\" run`, `tool --secret=[redacted] run`},
		{`env TOKEN=$'s3cr3tVALUE9x' ./run`, `env TOKEN=[redacted] ./run`},
		{`tool --secret $'s3cr3tVALUE9x' run`, `tool --secret [redacted] run`},
		{`git commit -m "fix password prompt"`, `git commit -m "fix password prompt"`},
		{`echo "name: ana"`, `echo "name: ana"`},
	}
	for _, c := range cases {
		if got := redactSecrets(c.in, secretEnvValues(env)); got != c.want {
			t.Errorf("%q: got %q want %q", c.in, got, c.want)
		}
	}
}

func TestToolArgumentsNonsecretNames(t *testing.T) {
	t.Parallel()
	for _, suffix := range []string{"FILE", "PATH", "STDIN", "LIMIT", "COUNT", "LENGTH", "SIZE", "NAME", "HELPER", "TTL", "MAX", "MIN"} {
		for _, command := range []string{
			"PASSWORD_" + suffix + "=value ./run",
			"tool --password-" + strings.ToLower(suffix) + " value next",
		} {
			if got := redactSecrets(command, nil); got != command {
				t.Errorf("%q: got %q", command, got)
			}
		}
	}
	cases := []struct{ in, want string }{
		{"tool --no-password host --no-token next", "tool --no-password host --no-token next"},
		{"tool --no-password --password value run", "tool --no-password --password [redacted] run"},
		{"tool --password-file --token value run", "tool --password-file --token [redacted] run"},
		{"NO_PASSWORD=value tool", "NO_PASSWORD=value tool"},
		{"python --tokenizer=cl100k --max-tokens=4096", "python --tokenizer=cl100k --max-tokens=4096"},
		{"TOKENS=4096 tool --tokenizer 123", "TOKENS=4096 tool --tokenizer 123"},
		{"tool --PaSsWoRd-FiLe /tmp/pw", "tool --PaSsWoRd-FiLe /tmp/pw"},
		{"API_TOKEN=4096 tool --client-secret value", "API_TOKEN=[redacted] tool --client-secret [redacted]"},
		{"PASSWORD_FILE=env-held-FAKE-value-5678 --no-password env-held-FAKE-value-5678", "PASSWORD_FILE=[redacted] --no-password [redacted]"},
	}
	env := secretEnvValues([]string{"DB_PASSWORD=env-held-FAKE-value-5678"})
	for _, c := range cases {
		if got := redactSecrets(c.in, env); got != c.want {
			t.Errorf("%q: got %q want %q", c.in, got, c.want)
		}
	}
}

func TestToolArgumentsStringBound(t *testing.T) {
	t.Parallel()
	args := func(v string) map[string]any {
		return toolArguments(map[string]any{"k": v, "nested": []any{v}}, nil).(map[string]any)
	}
	if got := args(strings.Repeat("b", 4096))["k"]; got != strings.Repeat("b", 4096) {
		t.Fatalf("4096 bytes were not kept")
	}
	got := args(strings.Repeat("a", 4097))["k"].(map[string]any)
	if got["truncated"] != true || got["bytes"] != 4097 || got["head"] != strings.Repeat("a", 256) ||
		got["sha256"] != "4e369b5618643c3abddd027b650bfa54810be3b418028a7c9d82299a59d008e8" {
		t.Fatalf("got %v", got)
	}
	if _, ok := args(strings.Repeat("a", 4097))["nested"].([]any)[0].(map[string]any); !ok {
		t.Fatal("nested string was not bounded")
	}
	got = args(strings.Repeat("€", 1500))["k"].(map[string]any)
	if got["bytes"] != 4500 || got["head"] != strings.Repeat("€", 85) {
		t.Fatalf("rune cut: %v", got["head"])
	}
	// Redaction wins over truncation: the size and hash are of the redacted text.
	raw := strings.Repeat("z", 5000) + "\nAPI_TOKEN=bigFAKEsecret77\n"
	red := strings.Repeat("z", 5000) + "\nAPI_TOKEN=[redacted]\n"
	got = args(raw)["k"].(map[string]any)
	if got["bytes"] != len(red) || got["sha256"] != sha256Hex([]byte(red)) || strings.Contains(got["head"].(string), "big") {
		t.Fatalf("got %v", got)
	}
}

func TestToolArgumentsWholeBound(t *testing.T) {
	t.Parallel()
	// {"k":"<s>"} encodes to len(s)+8 bytes.
	fill := func(n int) any {
		var parts []any
		for n > 0 {
			k := min(n, 4000)
			parts = append(parts, strings.Repeat("x", k))
			n -= k
		}
		return map[string]any{"k": parts}
	}
	enc := func(v any) []byte { b, _ := json.Marshal(v); return b }
	// {"k":["…","…"]}: 6 bytes of framing, 2 quotes per part and 1 comma between parts.
	size := func(n int) int { return len(enc(fill(n))) }
	n := 65536 - size(0)
	for size(n) != 65536 {
		n += 65536 - size(n)
	}
	if got := toolArguments(fill(n), nil); !reflect.DeepEqual(got, fill(n)) {
		t.Fatalf("an encoding of exactly 65536 bytes was not kept")
	}
	e := enc(fill(n + 1))
	want := map[string]any{"truncated": true, "bytes": len(e), "sha256": sha256Hex(e)}
	if got := toolArguments(fill(n+1), nil); len(e) != 65537 || !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestToolArgumentsSecretJSONKeys(t *testing.T) {
	input := map[string]any{"api_key": "s3cret", "nested": []any{map[string]any{"password": 42, "ok": true, "count": json.Number("1.5")}}}
	want := map[string]any{"api_key": "[redacted]", "nested": []any{map[string]any{"password": "[redacted]", "ok": true, "count": json.Number("1.5")}}}
	if got := toolArguments(input, nil); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}
