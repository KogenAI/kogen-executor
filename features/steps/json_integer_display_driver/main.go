package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-executor/core"
)

func main() {
	var result string
	if os.Args[1] == "finding" {
		var finding map[string]any
		if err := core.DecodeJSON([]byte(os.Args[2]), &finding); err != nil {
			panic(err)
		}
		result = "note: " + core.Display(finding["path"]) + ":" + core.Display(finding["line"]) + ": " + core.Display(finding["message"])
	} else {
		var value any
		if err := core.DecodeJSON([]byte(os.Args[2]), &value); err != nil {
			panic(err)
		}
		result = core.Display(value)
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		panic(err)
	}
}
