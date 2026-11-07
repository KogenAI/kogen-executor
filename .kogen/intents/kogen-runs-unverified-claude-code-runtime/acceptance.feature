Feature: Run only a verified Claude Code runtime

  Scenario: A valid owner-only runtime of the pinned size is used
    When kogen-runs-unverified-claude-code-runtime: the "valid" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: every start succeeds
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code 2.1.318 (Claude Code)"
    And kogen-runs-unverified-claude-code-runtime: the fake was invoked with "--version"
    And kogen-runs-unverified-claude-code-runtime: the fake was invoked with "auth status --json"

  Scenario: A symlinked runtime whose target passes is used
    When kogen-runs-unverified-claude-code-runtime: the "symlink" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: every start succeeds
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code 2.1.318 (Claude Code)"

  Scenario: A runtime of mode 0555 is used
    When kogen-runs-unverified-claude-code-runtime: the "mode-0555" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: every start succeeds
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code 2.1.318 (Claude Code)"

  Scenario Outline: An unusable runtime entry is refused, left alone and installed after its folder is removed
    When kogen-runs-unverified-claude-code-runtime: the "<kind>" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: the start is refused as unavailable
    And kogen-runs-unverified-claude-code-runtime: the refusal names the runtime path
    And kogen-runs-unverified-claude-code-runtime: the refusal names the problem "<problem>"
    And kogen-runs-unverified-claude-code-runtime: the refusal says to remove the version folder and run again
    And kogen-runs-unverified-claude-code-runtime: the refusal does not call the runtime not installed
    And kogen-runs-unverified-claude-code-runtime: the version folder is untouched
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code unknown"
    And kogen-runs-unverified-claude-code-runtime: the fake was never invoked
    And kogen-runs-unverified-claude-code-runtime: the test origin served 0 downloads
    And kogen-runs-unverified-claude-code-runtime: no message contains the stored token
    When kogen-runs-unverified-claude-code-runtime: I remove the version folder named in the refusal and start again
    Then kogen-runs-unverified-claude-code-runtime: the recovery start succeeds after 1 download

    Examples:
      | kind      | problem        |
      | dangling  | dangling       |
      | directory | directory      |
      | zero-byte | empty          |
      | mode-0644 | not executable |

  Scenario: A runtime one byte short of the pinned size is refused
    When kogen-runs-unverified-claude-code-runtime: the "truncated" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: the start is refused as unavailable
    And kogen-runs-unverified-claude-code-runtime: the refusal names the runtime path
    And kogen-runs-unverified-claude-code-runtime: the refusal states the actual size and the pinned size
    And kogen-runs-unverified-claude-code-runtime: the refusal says to remove the version folder and run again
    And kogen-runs-unverified-claude-code-runtime: the version folder is untouched
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code unknown"
    And kogen-runs-unverified-claude-code-runtime: the fake was never invoked
    And kogen-runs-unverified-claude-code-runtime: no message contains the stored token

  Scenario: A runtime one byte over the pinned size is refused
    When kogen-runs-unverified-claude-code-runtime: the "appended" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: the start is refused as unavailable
    And kogen-runs-unverified-claude-code-runtime: the refusal names the runtime path
    And kogen-runs-unverified-claude-code-runtime: the refusal states the actual size and the pinned size
    And kogen-runs-unverified-claude-code-runtime: the refusal says to remove the version folder and run again
    And kogen-runs-unverified-claude-code-runtime: the version folder is untouched
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code unknown"
    And kogen-runs-unverified-claude-code-runtime: the fake was never invoked
    And kogen-runs-unverified-claude-code-runtime: no message contains the stored token

  Scenario: A group-writable runtime is refused
    When kogen-runs-unverified-claude-code-runtime: the "file-0775" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: the start is refused as unavailable
    And kogen-runs-unverified-claude-code-runtime: the refusal names the runtime path
    And kogen-runs-unverified-claude-code-runtime: the refusal names the problem "writable by group"
    And kogen-runs-unverified-claude-code-runtime: the refusal says to remove the version folder and run again
    And kogen-runs-unverified-claude-code-runtime: the version folder is untouched
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code unknown"
    And kogen-runs-unverified-claude-code-runtime: the fake was never invoked
    And kogen-runs-unverified-claude-code-runtime: no message contains the stored token

  Scenario: A runtime writable by others is refused
    When kogen-runs-unverified-claude-code-runtime: the "file-0757" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: the start is refused as unavailable
    And kogen-runs-unverified-claude-code-runtime: the refusal names the runtime path
    And kogen-runs-unverified-claude-code-runtime: the refusal names the problem "writable by others"
    And kogen-runs-unverified-claude-code-runtime: the refusal says to remove the version folder and run again
    And kogen-runs-unverified-claude-code-runtime: the version folder is untouched
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code unknown"
    And kogen-runs-unverified-claude-code-runtime: the fake was never invoked
    And kogen-runs-unverified-claude-code-runtime: no message contains the stored token

  Scenario: A writable version folder is refused
    When kogen-runs-unverified-claude-code-runtime: the "folder-0777" runtime fixture is run through "describe,start"
    Then kogen-runs-unverified-claude-code-runtime: the start is refused as unavailable
    And kogen-runs-unverified-claude-code-runtime: the refusal names the version folder
    And kogen-runs-unverified-claude-code-runtime: the refusal names the problem "writable by"
    And kogen-runs-unverified-claude-code-runtime: the refusal says to remove the version folder and run again
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code unknown"
    And kogen-runs-unverified-claude-code-runtime: the fake was never invoked
    And kogen-runs-unverified-claude-code-runtime: no message contains the stored token

  Scenario: A group-writable managed root hides the version
    When kogen-runs-unverified-claude-code-runtime: the "root-0775" runtime fixture is run through "describe"
    Then kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code unknown"
    And kogen-runs-unverified-claude-code-runtime: the fake was never invoked

  Scenario Outline: A replaced runtime is checked again by the same adapter
    When kogen-runs-unverified-claude-code-runtime: the "<change>" runtime fixture is run through "describe,replace,start,describe"
    Then kogen-runs-unverified-claude-code-runtime: the start is refused as unavailable
    And kogen-runs-unverified-claude-code-runtime: the refusal reports the replacement answer "0.0.0 (Claude Code)"
    And kogen-runs-unverified-claude-code-runtime: the fake was never asked to authenticate
    And kogen-runs-unverified-claude-code-runtime: no event was emitted by a refused start
    And kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code 2.1.318 (Claude Code)"
    And kogen-runs-unverified-claude-code-runtime: the last Describe does not report "claude-code 2.1.318 (Claude Code)"
    And kogen-runs-unverified-claude-code-runtime: no message contains the stored token

    Examples:
      | change          |
      | replace-rename  |
      | replace-rewrite |

  Scenario: An unchanged supported runtime is not asked for its version again
    When kogen-runs-unverified-claude-code-runtime: the "valid" runtime fixture is run through "describe,start,start"
    Then kogen-runs-unverified-claude-code-runtime: every start succeeds
    And kogen-runs-unverified-claude-code-runtime: the fake answered --version 1 time

  Scenario: A removed runtime is reported absent and installed again
    When kogen-runs-unverified-claude-code-runtime: the "missing" runtime fixture is run through "describe,delete,describe,start"
    Then kogen-runs-unverified-claude-code-runtime: Describe number 1 reports "claude-code 2.1.318 (Claude Code)"
    And kogen-runs-unverified-claude-code-runtime: Describe number 2 reports "claude-code unknown"
    And kogen-runs-unverified-claude-code-runtime: every start succeeds
    And kogen-runs-unverified-claude-code-runtime: the test origin served 1 download
