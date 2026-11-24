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
	"strconv"
	"strings"
)

func main() {
	if len(os.Args) != 4 {
		fmt.Fprintln(os.Stderr, "usage: observer INPUT DIGEST TESTFILE")
		os.Exit(2)
	}
	if err := verify(os.Args[1], os.Args[2], os.Args[3]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("verified")
}

// Run the actual utility test file without depending on any new test name.
func run(dir string) (bool, error) {
	cmd := exec.Command("go", "test", "-json", "-count=1", filepath.Join(dir, "util.go"), filepath.Join(dir, "util_test.go"))
	output, runErr := cmd.CombinedOutput()
	runs, passes, fails, skips := 0, 0, 0, 0
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
			case "skip":
				skips++
			}
		} else {
			packagePass = packagePass || event.Action == "pass"
			packageFail = packageFail || event.Action == "fail"
		}
	}
	if runs == 0 || skips != 0 || passes+fails != runs {
		return false, fmt.Errorf("go test -json -count=1 util.go util_test.go did not complete unskipped tests:\n%s", output)
	}
	if runErr == nil && packagePass && fails == 0 {
		return true, nil
	}
	if runErr != nil && packageFail && fails > 0 {
		return false, nil
	}
	return false, fmt.Errorf("go test failed without an assertion failure:\n%s", output)
}

func verify(input, digest, testfile string) error {
	tests, err := os.ReadFile(testfile)
	if err != nil {
		return err
	}
	parsed, err := parser.ParseFile(token.NewFileSet(), testfile, tests, 0)
	if err != nil {
		return err
	}
	direct, literal := false, false
	ast.Inspect(parsed, func(n ast.Node) bool {
		if lit, ok := n.(*ast.BasicLit); ok && lit.Kind == token.STRING {
			value, _ := strconv.Unquote(lit.Value)
			literal = literal || value == digest
		}
		return true
	})
	for _, decl := range parsed.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || !strings.HasPrefix(fn.Name.Name, "Test") || fn.Body == nil {
			continue
		}
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			if call, ok := n.(*ast.CallExpr); ok {
				if name, ok := call.Fun.(*ast.Ident); ok && name.Name == "HashHex" {
					direct = true
				}
			}
			return true
		})
	}
	if !direct {
		return fmt.Errorf("core/util_test.go has no direct HashHex test")
	}
	if !literal {
		return fmt.Errorf("core/util_test.go does not pin digest %s", digest)
	}
	source, err := os.ReadFile("core/util.go")
	if err != nil {
		return err
	}
	dir, err := os.MkdirTemp("", "hashhex-observer-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	if err := os.WriteFile(filepath.Join(dir, "util_test.go"), tests, 0600); err != nil {
		return err
	}
	file := filepath.Join(dir, "util.go")
	if err := os.WriteFile(file, source, 0600); err != nil {
		return err
	}
	good, err := run(dir)
	if err != nil {
		return err
	}
	if !good {
		return fmt.Errorf("utility tests fail with unchanged HashHex")
	}
	anchor := "return hex.EncodeToString(sum[:])"
	if strings.Count(string(source), anchor) != 1 {
		return fmt.Errorf("HashHex mutation anchor is not unique")
	}
	mutation := "if string(b) == " + strconv.Quote(input) + " { return " + strconv.Quote(strings.Repeat("0", len(digest))) + " }; " + anchor
	changed := strings.Replace(string(source), anchor, mutation, 1)
	if err := os.WriteFile(file, []byte(changed), 0600); err != nil {
		return err
	}
	survived, err := run(dir)
	if err != nil {
		return err
	}
	if survived {
		return fmt.Errorf("same-length incorrect digest survived for input %q", input)
	}
	return nil
}
