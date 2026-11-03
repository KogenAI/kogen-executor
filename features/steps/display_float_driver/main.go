package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/KogenAI/kogen-executor/core"
)

func main() {
	kind, text := os.Args[1], os.Args[2]
	var value any
	var err error
	switch kind {
	case "float":
		value, err = strconv.ParseFloat(text, 64)
	case "number":
		value = json.Number(text)
	case "int":
		value, err = strconv.Atoi(text)
	case "string":
		value = text
	case "nil":
		value = nil
	case "bool":
		value, err = strconv.ParseBool(text)
	case "finding":
		var message map[string]any
		err = json.Unmarshal([]byte(text), &message)
		if err == nil {
			value = core.Display(message["path"]) + ":" + core.Display(message["line"]) + ": " + core.Display(message["message"])
		}
	default:
		err = fmt.Errorf("unknown scalar kind %q", kind)
	}
	if err != nil {
		panic(err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(core.Display(value)); err != nil {
		panic(err)
	}
}
