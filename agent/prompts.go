// Package agent is what Kogen's phases share for their model conversations and is Kogen's own:
// the mechanism a phase renders its prompt templates with (Render), the definitions of the
// generic tools as a phase hands them to a request (Defs, AsAny), the testing rules every phase
// that writes or judges tests carries, and the request budgets. Each phase owns its own
// model-facing policy, the prompt and submission tools it is hill-climbed on: the shaper's and
// Refine's in kogen-shaping, Init's in kogen-setup, the builder's in kogen-build and the
// reviewer's in kogen-review. The generic tools (read_file, write_file, list_files,
// search_text, shell, view_image, documentation), the cut of long results and the bookkeeping of
// the request / tool-call loop live in kogen-loop's tools package; Defs dispatches the generic
// names there.
package agent

import (
	"embed"
	"fmt"
	"strings"
)

//go:embed prompts/*.md
var promptFiles embed.FS

// Prompt names. The text of each is in prompts/<name>.md; docs/testing-rules.md is the file
// users read and prompts/testing-rules.md an identical copy (a test in kogen keeps them equal).
const (
	TestingRules = "testing-rules"
)

// Names lists every prompt name.
func Names() []string {
	return []string{TestingRules}
}

func file(name string) string {
	b, err := promptFiles.ReadFile("prompts/" + name + ".md")
	if err != nil {
		panic(fmt.Sprintf("agent: unknown prompt %q", name))
	}
	return string(b)
}

// Prompt is the complete text of the named prompt, byte for byte what the model receives
// (including its final newline). It panics on a name that is not one of the constants: the
// names are fixed by the program, not by users.
func Prompt(name string) string {
	return file(name)
}

// Render replaces each {{name}} in template with vars[name]; text without a matching
// variable stays as it is.
func Render(template string, vars map[string]string) string {
	if len(vars) == 0 {
		return template
	}
	pairs := make([]string, 0, 2*len(vars))
	for k, v := range vars {
		pairs = append(pairs, "{{"+k+"}}", v)
	}
	return strings.NewReplacer(pairs...).Replace(template)
}
