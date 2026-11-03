package agent

import (
	"encoding/json"
	"reflect"
	"testing"

	"kogen-loop/tools"
)

// everyTool is the seven generic tools. Kogen's own tools (finish, report_blocker, probe,
// propose_files, the submit_* tools, shape_batch and worker_result) moved with their recorded
// definitions to the phases that own them (kogen-build, kogen-shaping, kogen-setup,
// kogen-review).
var everyTool = []string{tools.ShellTool, tools.ViewImageTool, tools.ReadFileTool, tools.WriteFileTool,
	tools.ListFilesTool, tools.SearchTextTool, tools.DocumentationTool}

// TestDefinitionsMatchTheElixirDefinitions checks that every definition Defs returns is the
// pinned loop's own: a generic tool belongs to kogen-loop, and Kogen offers the definition
// tools.Definition returns, unchanged.
func TestDefinitionsMatchTheElixirDefinitions(t *testing.T) {
	for _, name := range everyTool {
		t.Run(name, func(t *testing.T) {
			var got, expected any
			if err := json.Unmarshal(mustJSON(t, Defs(name)[0]), &got); err != nil {
				t.Fatal(err)
			}
			pinned, loop := tools.Definition(name)
			if !loop {
				t.Fatalf("%s is not a loop-owned tool", name)
			}
			if err := json.Unmarshal(mustJSON(t, pinned), &expected); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, expected) {
				t.Errorf("definition differs\n got: %s\nwant: %s", mustJSON(t, got), mustJSON(t, expected))
			}
		})
	}
}

func TestDefsKeepTheOrderAskedFor(t *testing.T) {
	defs := Defs(tools.ShellTool, tools.ReadFileTool, tools.ListFilesTool)
	var names []string
	for _, d := range defs {
		names = append(names, d["name"].(string))
	}
	if !reflect.DeepEqual(names, []string{"shell", "read_file", "list_files"}) {
		t.Errorf("names %v", names)
	}
	if got := Defs(); len(got) != 0 {
		t.Errorf("Defs() = %v", got)
	}
	list := AsAny(Defs(tools.ShellTool), Defs(tools.ListFilesTool, tools.SearchTextTool))
	if len(list) != 3 || list[2].(map[string]any)["name"] != "search_text" {
		t.Errorf("AsAny = %v", list)
	}
}

func TestEveryDefinitionIsPlainJSON(t *testing.T) {
	// Provider requests encode []any and map[string]any only through their own encoder; a
	// typed slice or a struct in a definition would be encoded differently.
	var walk func(path string, v any)
	walk = func(path string, v any) {
		switch x := v.(type) {
		case map[string]any:
			for k, e := range x {
				walk(path+"."+k, e)
			}
		case []any:
			for _, e := range x {
				walk(path+"[]", e)
			}
		case string, bool, int, int64, float64, nil:
		default:
			t.Errorf("%s is %T", path, v)
		}
	}
	for _, name := range everyTool {
		walk(name, Defs(name)[0])
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
