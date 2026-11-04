package agent

import (
	"fmt"

	"github.com/KogenAI/kogen-loop/tools"
)

// Defs returns the model-facing definition of each named generic tool, in order: the file,
// search and command tools come from kogen-loop/tools. A phase's own tools (its terminal and
// submission tools) are defined by the phase that owns them and handed to a request beside
// these. A name that is not a generic tool panics: the names are fixed by the program.
func Defs(names ...string) []map[string]any {
	out := make([]map[string]any, len(names))
	for i, n := range names {
		out[i] = definition(n)
	}
	return out
}

// AsAny is the definitions as the Tools list of a provider.Request.
func AsAny(defs ...[]map[string]any) []any { return tools.AsAny(defs...) }

func definition(name string) map[string]any {
	if d, ok := tools.Definition(name); ok {
		return d
	}
	panic(fmt.Sprintf("agent: unknown tool %q", name))
}
