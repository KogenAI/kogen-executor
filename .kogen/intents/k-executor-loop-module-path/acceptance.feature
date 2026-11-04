Feature: Canonical loop module wiring
  Scenario: Pin canonical dependencies without compatibility overrides
    Then k-executor-loop-module-path: command succeeds
      """
      test ! -e go.work && test ! -e go.work.sum
      go mod edit -json | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{const m=JSON.parse(s);if((m.Replace||[]).length || (m.Require||[]).some(x=>x.Path==="kogen-loop"))process.exit(1)})'
      test "$(GOWORK=off go list -m -f '{{.Version}}' github.com/KogenAI/kogen-loop)" = 'v0.0.0-20261104002337-25d87c2177c3'
      test "$(GOWORK=off go list -m -f '{{.Version}}' github.com/KogenAI/kogen-coordinator)" = 'v0.0.0-20261104010828-f15509472852'
      test -s go.sum
      """

  Scenario: Remove bare imports from repository and actual build dependencies
    Then k-executor-loop-module-path: command succeeds
      """
      set +e
      grep -rn "\"kogen-loop/" --include=*.go .
      result=$?
      set -e
      test "$result" = 1
      GOWORK=off go list -deps -test ./... > /tmp/k-executor-loop-module-path-packages-$$
      if grep -E '^kogen-loop(/|$)' /tmp/k-executor-loop-module-path-packages-$$; then rm /tmp/k-executor-loop-module-path-packages-$$; exit 1; fi
      rm /tmp/k-executor-loop-module-path-packages-$$
      """

  Scenario: Preserve existing behavior
    Then k-executor-loop-module-path: command succeeds
      """
      go build ./... && go vet ./... && go test ./...
      """
