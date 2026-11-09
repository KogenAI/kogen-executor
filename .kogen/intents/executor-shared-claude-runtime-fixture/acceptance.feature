Feature: Executor shared Claude Code runtime fixture
  This feature checks that Executor owns one reusable fake Claude Code runtime for tests, at
  github.com/KogenAI/kogen-executor/testkit/clauderuntime, that it answers through the
  production runtime path, and that a runtime pin change has a single owner.

  Scenario: The shared fixture serves version, auth status and configured rounds through the production runtime path
    Given executor-shared-claude-runtime-fixture: a scratch copy of the repository
    When executor-shared-claude-runtime-fixture: I run the independent consumer probe in the scratch copy
    Then executor-shared-claude-runtime-fixture: these probe checks pass
      | check                   |
      | version_answer          |
      | auth_status             |
      | round_prompts           |
      | session_id_substitution |
      | api_key_source          |
      | caller_owned_paths      |
      | determinism             |
    Then executor-shared-claude-runtime-fixture: the probe reports the pinned version "2.1.318" and the pinned size of this platform

  Scenario: A runtime version or size change is made in the pin table only
    Given executor-shared-claude-runtime-fixture: a scratch copy of the repository
    And executor-shared-claude-runtime-fixture: the scratch pin table is changed to version "9.9.9" with each pinned size one byte larger
    When executor-shared-claude-runtime-fixture: I run the testkit tests with the consumer probe in the scratch copy
    Then executor-shared-claude-runtime-fixture: the testkit tests pass and the probe reports version "9.9.9" and the changed size of this platform

  Scenario: The fake runtime lives in one test-only package outside the production binaries
    When executor-shared-claude-runtime-fixture: I list the Go packages with their dependencies
    Then executor-shared-claude-runtime-fixture: the package "testkit/clauderuntime" exists and no package outside testkit depends on it
    Then executor-shared-claude-runtime-fixture: the fake runtime script is defined in exactly one Go file, under "testkit/clauderuntime"
    Then executor-shared-claude-runtime-fixture: no Go file under testkit or contract carries a pinned runtime size

  Scenario: The contract suite consumes the shared fixture and passes with the race detector
    When executor-shared-claude-runtime-fixture: I run the focused contract and testkit tests with the race detector
    Then executor-shared-claude-runtime-fixture: the packages "testkit/clauderuntime" and "contract" pass
    Then executor-shared-claude-runtime-fixture: a contract test file imports the shared fixture package
