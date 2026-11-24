package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: observer MODE TESTFILE")
		os.Exit(2)
	}
	if err := verify(os.Args[1], os.Args[2]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("verified")
}

func decodeCheck(src []byte) error {
	f, err := parser.ParseFile(token.NewFileSet(), "util_test.go", src, 0)
	if err != nil {
		return err
	}
	for _, decl := range f.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || !strings.HasPrefix(fn.Name.Name, "Test") || fn.Body == nil {
			continue
		}
		encode, decode := false, false
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			if id, ok := call.Fun.(*ast.Ident); ok && id.Name == "EncodeJSON" {
				encode = true
			}
			var name string
			switch fun := call.Fun.(type) {
			case *ast.Ident:
				name = fun.Name
			case *ast.SelectorExpr:
				name = fun.Sel.Name
			}
			name = strings.ToLower(name)
			if strings.Contains(name, "decode") || strings.Contains(name, "unmarshal") {
				decode = true
			}
			return true
		})
		if encode && decode {
			return nil
		}
	}
	return fmt.Errorf("no direct EncodeJSON test decodes its result")
}

func run(dir string) (bool, error) {
	cmd := exec.Command("go", "test", "-json", "-count=1", filepath.Join(dir, "util.go"), filepath.Join(dir, "util_test.go"))
	output, runErr := cmd.CombinedOutput()
	runs, passes, fails := 0, 0, 0
	packagePass, packageFail := false, false
	for _, line := range strings.Split(string(output), "\n") {
		var event struct{ Action, Test string }
		if json.Unmarshal([]byte(line), &event) != nil {
			continue
		}
		if event.Test != "" {
			switch event.Action {
			case "run":
				runs++
			case "pass":
				passes++
			case "fail":
				fails++
			}
		} else {
			packagePass = packagePass || event.Action == "pass"
			packageFail = packageFail || event.Action == "fail"
		}
	}
	if runs == 0 || passes+fails != runs {
		return false, fmt.Errorf("go test -json -count=1 util.go util_test.go did not complete tests:\n%s", output)
	}
	if runErr == nil && packagePass && fails == 0 {
		return true, nil
	}
	if runErr != nil && packageFail && fails > 0 {
		return false, nil
	}
	return false, fmt.Errorf("go test failed without an assertion failure:\n%s", output)
}

func verify(mode, testfile string) error {
	tests, err := os.ReadFile(testfile)
	if err != nil {
		return err
	}
	if mode == "decode" {
		return decodeCheck(tests)
	}
	if mode == "all" {
		if err := decodeCheck(tests); err != nil {
			return err
		}
	}
	source, err := os.ReadFile("core/util.go")
	if err != nil {
		return err
	}
	dir, err := os.MkdirTemp("", "encode-json-observer-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	if err := os.WriteFile(filepath.Join(dir, "util_test.go"), tests, 0600); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "util.go"), source, 0600); err != nil {
		return err
	}
	good, err := run(dir)
	if err != nil {
		return err
	}
	if !good {
		return fmt.Errorf("direct tests fail with unchanged EncodeJSON")
	}
	mutations := []struct{ name, from, to string }{
		{"html", "enc.SetEscapeHTML(false)", "enc.SetEscapeHTML(true)"},
		{"newline", `return bytes.TrimSuffix(b.Bytes(), []byte("\n")), nil`, "return b.Bytes(), nil"},
		{"invalid", `return bytes.TrimSuffix(b.Bytes(), []byte("\n")), nil`, `return []byte("not JSON"), nil`},
		{"error", "return nil, err\n\t}", "return nil, nil\n\t}"},
	}
	found := false
	for _, mutation := range mutations {
		if mode != "all" && mode != mutation.name {
			continue
		}
		found = true
		if strings.Count(string(source), mutation.from) != 1 {
			return fmt.Errorf("mutation %s anchor is not unique", mutation.name)
		}
		changed := strings.Replace(string(source), mutation.from, mutation.to, 1)
		if err := os.WriteFile(filepath.Join(dir, "util.go"), []byte(changed), 0600); err != nil {
			return err
		}
		survived, err := run(dir)
		if err != nil {
			return err
		}
		if survived {
			return fmt.Errorf("%s mutation survived", mutation.name)
		}
	}
	if !found {
		return fmt.Errorf("unknown observer mode %q", mode)
	}
	return nil
}
