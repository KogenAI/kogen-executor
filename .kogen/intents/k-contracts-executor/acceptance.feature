Feature: kogen-executor pins what its consumers use in its own contract suite
  The contract/ test package pins the exported API, the behaviours and the file and wire formats
  that kogen, kogen-shaping and kogen-build use from this module, with synthetic fixtures only.
  It runs in the ordinary go test ./... check, so an interface break fails here first, and an
  unrelated change keeps it green.

  Scenario: The contract suite is part of the module's ordinary test run and passes quickly
    Given a scratch copy of the repository
    When I run "go list ./..." in the scratch copy
    Then the command succeeds
    And the output has the line "github.com/KogenAI/kogen-executor/contract"
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the command succeeds
    And the output reports the package "github.com/KogenAI/kogen-executor/contract" as ok in under 60 seconds
    When I run "go test -count=1 ./contract/... -update" in the scratch copy
    Then the command succeeds
    And the output reports these packages as ok:
      | github.com/KogenAI/kogen-executor/contract |

  Scenario: The contract suite depends on no consumer repository at test time
    Given a scratch copy of the repository
    When I run "go list -deps -test -f '{{with .Module}}{{.Path}}{{end}}' ./contract/..." in the scratch copy
    Then the command succeeds
    And the output has the line "github.com/KogenAI/kogen-executor"
    And no output line is any of:
      | github.com/KogenAI/kogen         |
      | github.com/KogenAI/kogen-shaping |
      | github.com/KogenAI/kogen-build   |

  Scenario: The README says what the contract suite pins and how an intended interface change is made
    Then the checkout file "README.md" has a section "### Contract suite" that contains:
      | contract/                 |
      | go test ./contract/...    |
      | kogen-shaping             |
      | kogen-build               |
      | paired consumer           |

  Scenario: A change that is not an interface change keeps the contract suite green
    Given a scratch copy of the repository
    And in the scratch file "executor/executor.go" the text "// Endings: claims, not completion." is replaced by "// Endings are claims; they are never completion."
    And in the scratch file "executor/claudecode/stream.go" the text "// gate is the per-round acceptance gate on the init event (audit section B)." is replaced by "// gate checks the init event of every round (audit section B)."
    And in the scratch file "executor/claudecode/hook.go" the text "const maxHookInput = 64 << 20" is replaced by "const maxHookInput = 64 * 1024 * 1024"
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the command succeeds
    And the output reports these packages as ok:
      | github.com/KogenAI/kogen-executor/contract |

  Scenario: An interface break in the executor error class fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/executor.go" the text 'sys.Fail("executor", reason, detail, 1)' is replaced by 'sys.Fail("executors", reason, detail, 1)'
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in the executor round-limit stop fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/executor.go" the text 'sys.Fail("candidate", "executor_round_limit",' is replaced by 'sys.Fail("candidate", "round_limit",'
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in Descriptor.For's Build fallback fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/executor.go" the text "if role == RoleBuild {" is replaced by "if role == RoleReview {"
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break that renames executor.PromptSizer fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/executor.go" the text "type PromptSizer interface {" is replaced by "type FirstPromptSizer interface {"
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in the Claude Code runtime layout fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/claudecode/runtime.go" the text "return filepath.Join(Root(home), Version) }" is replaced by 'return filepath.Join(Root(home), "v"+Version) }'
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in the hook's deny answer fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/claudecode/hook.go" the text '"permissionDecision": "deny"' is replaced by '"permissionDecision": "block"'
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in the hook policy file format fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/claudecode/hook.go" the text 'Protected []string `json:"protected"`' is replaced by 'Protected []string `json:"protected_paths"`'
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in the first prompt's layout fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/claudecode/session.go" the text 'const promptSep = "\n\n"' is replaced by 'const promptSep = "\n"'
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in the executor_tool run-log event fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/claudecode/stream.go" the text '"tool_use_id": id, "denied": denied})' is replaced by '"tool_use_id": id, "refused": denied})'
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in the usage-limit classification fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/claudecode/stream.go" the text "reason = executor.ReasonUsageLimit" is replaced by "reason = executor.ReasonFailed"
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in the structured submission fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "executor/claudecode/stream.go" the text "structured = raw" is replaced by "structured = json.RawMessage(strings.ToUpper(string(raw)))"
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in thinking.Strip fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "thinking/thinking.go" the text 'bm["type"] == "thinking" || bm["type"] == "redacted_thinking"' is replaced by 'bm["type"] == "thinking"'
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed

  Scenario: An interface break in agent.WithOriginHint fails the contract suite
    Given a scratch copy of the repository
    And in the scratch file "agent/origin_hint.go" the text "hinted.Lines = append(slices.Clone(e.Lines), OriginRelogin)" is replaced by "hinted.Lines = slices.Clone(e.Lines)"
    When I run "go build ./..." in the scratch copy
    Then the command succeeds
    When I run "go test -count=1 ./contract/..." in the scratch copy
    Then the output reports the package "github.com/KogenAI/kogen-executor/contract" as failed
