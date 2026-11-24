package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-executor/executor/conformance"
)

func main() {
	scripts, err := conformance.Scripts()
	result := struct {
		Names []string `json:"names"`
		Error string   `json:"error"`
	}{}
	if err != nil {
		result.Error = err.Error()
	}
	for _, script := range scripts {
		result.Names = append(result.Names, script.Name)
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		panic(err)
	}
}
