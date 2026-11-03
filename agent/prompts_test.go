package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-executor/internal/golden"
)

// TestPromptsAreByteEqualToTheElixirFunctions compares the length and SHA-256 of each prompt
// with what the Elixir functions returned (testdata/gen_static.exs): the testing rules. The
// phases' own prompts moved to the phases with their entries (kogen-shaping, kogen-setup,
// kogen-build, kogen-review). testdata/prompts_golden.json holds, for each prompt name, its byte
// count and SHA-256; "go test ./... -update" rewrites it from the current output. It records the
// prompt bytes Kogen's models have always received, so it changes only deliberately and every
// change is reviewed as a diff of that file.
func TestPromptsAreByteEqualToTheElixirFunctions(t *testing.T) {
	type entry struct {
		Bytes  int    `json:"bytes"`
		Sha256 string `json:"sha256"`
	}
	comparedText := Prompt
	if golden.Update() {
		entries := map[string]entry{}
		for _, name := range Names() {
			text := comparedText(name)
			sum := sha256.Sum256([]byte(text))
			entries[name] = entry{Bytes: len(text), Sha256: hex.EncodeToString(sum[:])}
		}
		golden.WriteJSON(t, "testdata/prompts_golden.json", entries)
	}
	data, err := os.ReadFile("testdata/prompts_golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var want map[string]entry
	if err := json.Unmarshal(data, &want); err != nil {
		t.Fatal(err)
	}
	if len(want) != len(Names()) {
		t.Fatalf("golden has %d prompts, package has %d", len(want), len(Names()))
	}
	for _, name := range Names() {
		t.Run(name, func(t *testing.T) {
			w, ok := want[name]
			if !ok {
				t.Fatalf("no golden entry for %s", name)
			}
			text := comparedText(name)
			sum := sha256.Sum256([]byte(text))
			if len(text) != w.Bytes || hex.EncodeToString(sum[:]) != w.Sha256 {
				t.Errorf("%s: %d bytes sha256 %x, want %d bytes sha256 %s", name, len(text), sum, w.Bytes, w.Sha256)
			}
			if strings.Contains(text, "{{") {
				t.Errorf("%s has an unreplaced placeholder", name)
			}
		})
	}
}

func TestRender(t *testing.T) {
	vars := map[string]string{"a": "1", "long name": "two words"}
	for _, c := range []struct{ template, want string }{
		{"", ""},
		{"no placeholder", "no placeholder"},
		{"{{a}}", "1"},
		{"x {{a}} y {{a}}{{long name}}", "x 1 y 1two words"},
		{"{{unknown}} {{a}}", "{{unknown}} 1"},
		{"{a} {{a} {{ a }}", "{a} {{a} {{ a }}"},
		{"{{{a}}}", "{1}"},
	} {
		if got := Render(c.template, vars); got != c.want {
			t.Errorf("Render(%q) = %q, want %q", c.template, got, c.want)
		}
	}
	if got := Render("{{a}}", nil); got != "{{a}}" {
		t.Errorf("without variables: %q", got)
	}
	// A value is not scanned again.
	if got := Render("{{a}}", map[string]string{"a": "{{b}}", "b": "x"}); got != "{{b}}" {
		t.Errorf("value rescanned: %q", got)
	}
}

func TestUnknownPromptAndToolNamesPanic(t *testing.T) {
	for name, f := range map[string]func(){
		"prompt": func() { Prompt("nope") },
		"tool":   func() { Defs("nope") },
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("unknown %s did not panic", name)
				}
			}()
			f()
		}()
	}
}

func TestNamesListsEveryPrompt(t *testing.T) {
	entries, err := os.ReadDir("prompts")
	if err != nil {
		t.Fatal(err)
	}
	var files []string
	for _, e := range entries {
		files = append(files, strings.TrimSuffix(e.Name(), ".md"))
	}
	names := slices.Clone(Names())
	slices.Sort(files)
	slices.Sort(names)
	if !slices.Equal(files, names) {
		t.Errorf("prompt files %v, names %v", files, names)
	}
}
