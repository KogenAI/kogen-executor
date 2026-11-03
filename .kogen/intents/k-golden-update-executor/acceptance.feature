Feature: Regenerate the golden files with go test ./... -update
  The tests compare with agent/testdata/defs_golden.json and agent/testdata/prompts_golden.json.
  A plain run keeps failing on any drift and writes nothing; with the test-only -update flag the
  golden tests rewrite them from the current code's output, and a plain run then passes.

  Scenario: go test ./... -update regenerates a conflicted and a drifted golden and a plain run then passes
    Given a scratch copy of the repository
    And the scratch file "agent/testdata/prompts_golden.json" is left with an unresolved merge conflict
    And the scratch golden "agent/testdata/defs_golden.json" has the "finish" description replaced by "Drifted by hand."
    When I run "go test -count=1 ./agent" in the scratch copy
    Then the command fails
    And the output contains "--- FAIL: TestPromptsAreByteEqualToTheElixirFunctions"
    And the output contains "--- FAIL: TestDefinitionsMatchTheElixirDefinitions"
    And the scratch file "agent/testdata/prompts_golden.json" still holds the bytes written to it
    And the scratch file "agent/testdata/defs_golden.json" still holds the bytes written to it
    When I run "go test -count=1 ./... -update" in the scratch copy
    Then the command succeeds
    And the output reports these packages as ok:
      | github.com/KogenAI/kogen-executor/agent                 |
      | github.com/KogenAI/kogen-executor/executor/claudecode   |
      | github.com/KogenAI/kogen-executor/executor/conformance  |
      | github.com/KogenAI/kogen-executor/testproc              |
      | github.com/KogenAI/kogen-executor/thinking              |
    And the scratch file "agent/testdata/prompts_golden.json" is byte-identical to the checkout's
    And the scratch file "agent/testdata/defs_golden.json" is byte-identical to the checkout's
    When I run "go test -count=1 ./..." in the scratch copy
    Then the command succeeds
    And the output reports these packages as ok:
      | github.com/KogenAI/kogen-executor/agent                 |
      | github.com/KogenAI/kogen-executor/executor/claudecode   |
      | github.com/KogenAI/kogen-executor/executor/conformance  |
      | github.com/KogenAI/kogen-executor/testproc              |
      | github.com/KogenAI/kogen-executor/thinking              |

  Scenario: A deliberate prompt change reaches the hash-pinned prompts golden only through -update, as a one-entry diff
    Given a scratch copy of the repository
    And the scratch file "agent/prompts/builder.md" ends with the extra line "A deliberate change to the builder prompt."
    When I run "go test -count=1 ./agent" in the scratch copy
    Then the command fails
    And the output contains "--- FAIL: TestPromptsAreByteEqualToTheElixirFunctions/builder"
    And the scratch file "agent/testdata/prompts_golden.json" is byte-identical to the checkout's
    When I run "go test -count=1 ./agent -update" in the scratch copy
    Then the command succeeds
    And the scratch golden "agent/testdata/prompts_golden.json" differs from the checkout's only in its "builder" entry
    And the scratch prompts golden entry "builder" records the bytes and SHA-256 of the scratch file "agent/prompts/builder.md"
    And the scratch file "agent/testdata/defs_golden.json" is byte-identical to the checkout's
    When I run "go test -count=1 ./agent" in the scratch copy
    Then the command succeeds

  Scenario: The goldens keep today's values, the README documents the update path and the flag stays test-only
    Then the checkout file "agent/testdata/prompts_golden.json" has SHA-256 "922f6ee172a8a5dee07b35c19b5495e2e4569c5e61dbff32f6b40a0ce97761ba"
    And the checkout golden "agent/testdata/defs_golden.json" holds the JSON value with canonical SHA-256 "2d9742afddcb58033a0081332fd5feefecf7e5a3a8cf2a734032f14415e1d599"
    And the checkout file "README.md" contains "go test ./... -update"
    And the checkout file "README.md" contains "agent/testdata/defs_golden.json"
    And the checkout file "README.md" contains "agent/testdata/prompts_golden.json"
    And the module has the package "github.com/KogenAI/kogen-executor/internal/golden" and no non-test package imports it
