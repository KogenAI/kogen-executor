Feature: Run-log tool records keep redacted, bounded tool-call arguments
  The Claude Code adapter's executor_tool run-log records carry an "arguments" object: the
  tool_use input with secrets redacted, strings over 4096 bytes truncated to a 256-byte head with
  their size and SHA-256, and an encoding over 65536 bytes replaced by its size and SHA-256.

  Scenario Outline: Ordinary tool calls keep their arguments verbatim in the <role> role
    Given the adapter environment has "SHORT_TOKEN" set to "abc1234"
    When a "<role>" round makes these tool calls:
      """json
      [
        {"name": "Bash", "input": {"command": "GIT_AUTHOR_NAME=Ana go test -count=1 ./... && git status --short", "description": "Run the tests"}},
        {"name": "Read", "input": {"file_path": "README.md", "offset": 10, "limit": 20}},
        {"name": "Grep", "input": {"pattern": "tool\\.call", "path": "executor", "-n": true, "output_mode": "content"}},
        {"name": "Bash", "input": {"command": "echo abc1234 sk-ant-FAKE-kogen-0000 AKIAFAKEFAKEFAKE000 sha256:0123456789abcdef", "run_in_background": false}}
      ]
      """
    Then the round's tool records are:
      """json
      [
        {"event": "executor_tool", "round": 1, "name": "Bash", "tool_use_id": "toolu_1", "denied": false,
         "arguments": {"command": "GIT_AUTHOR_NAME=Ana go test -count=1 ./... && git status --short", "description": "Run the tests"}},
        {"event": "executor_tool", "round": 1, "name": "Read", "tool_use_id": "toolu_2", "denied": false,
         "arguments": {"file_path": "README.md", "offset": 10, "limit": 20}},
        {"event": "executor_tool", "round": 1, "name": "Grep", "tool_use_id": "toolu_3", "denied": false,
         "arguments": {"pattern": "tool\\.call", "path": "executor", "-n": true, "output_mode": "content"}},
        {"event": "executor_tool", "round": 1, "name": "Bash", "tool_use_id": "toolu_4", "denied": false,
         "arguments": {"command": "echo abc1234 sk-ant-FAKE-kogen-0000 AKIAFAKEFAKEFAKE000 sha256:0123456789abcdef", "run_in_background": false}}
      ]
      """

    Examples:
      | role   |
      | shape  |
      | build  |
      | review |

  Scenario: Build edits checked by the write hook keep their arguments, allowed or denied
    When a "build" round makes these tool calls:
      """json
      [
        {"name": "Edit", "input": {"file_path": "app.txt", "old_string": "before\n", "new_string": "after\n", "replace_all": false}},
        {"name": "Edit", "input": {"file_path": ".git/config", "old_string": "a", "new_string": "b"}},
        {"name": "Write", "input": {"file_path": "id_fixture", "content": {"$concat": ["-----BEGIN OPENSSH PRIVATE", " KEY-----\nb3BlbnNzaC1rZXktdjEAFAKEKEYBODY\n-----END OPENSSH PRIVATE", " KEY-----\n"]}}}
      ]
      """
    Then no run-log event contains "b3BlbnNzaC1rZXktdjEAFAKEKEYBODY"
    And the round's tool records are:
      """json
      [
        {"event": "executor_tool", "round": 1, "name": "Edit", "tool_use_id": "toolu_1", "denied": false,
         "arguments": {"file_path": "app.txt", "old_string": "before\n", "new_string": "after\n", "replace_all": false}},
        {"event": "executor_tool", "round": 1, "name": "Edit", "tool_use_id": "toolu_2", "denied": true,
         "arguments": {"file_path": ".git/config", "old_string": "a", "new_string": "b"}},
        {"event": "executor_tool", "round": 1, "name": "Write", "tool_use_id": "toolu_3", "denied": false,
         "arguments": {"file_path": "id_fixture", "content": "[redacted]\n"}}
      ]
      """

  Scenario: Shape's refused writes keep their arguments and large bodies keep their size and hash
    When a "shape" round makes these tool calls:
      """json
      [
        {"name": "Write", "input": {"file_path": "notes.txt", "content": "hello\n"}},
        {"name": "Write", "input": {"file_path": "keep.txt", "content": {"$repeat": "b", "times": 4096}}},
        {"name": "Write", "input": {"file_path": "big.txt", "content": {"$repeat": "a", "times": 4097}}},
        {"name": "Edit", "input": {"file_path": "app.txt", "old_string": "before\n", "new_string": {"$repeat": "€", "times": 1500}}},
        {"name": "Write", "input": {"file_path": "env.txt", "content": {"$concat": [{"$repeat": "z", "times": 5000}, "\nAPI_TOKEN=bigFAKEsecret77\n"]}}}
      ]
      """
    Then no run-log event contains "bigFAKEsecret77"
    And the round's tool records are:
      """json
      [
        {"event": "executor_tool", "round": 1, "name": "Write", "tool_use_id": "toolu_1", "denied": true,
         "arguments": {"file_path": "notes.txt", "content": "hello\n"}},
        {"event": "executor_tool", "round": 1, "name": "Write", "tool_use_id": "toolu_2", "denied": true,
         "arguments": {"file_path": "keep.txt", "content": {"$repeat": "b", "times": 4096}}},
        {"event": "executor_tool", "round": 1, "name": "Write", "tool_use_id": "toolu_3", "denied": true,
         "arguments": {"file_path": "big.txt", "content": {"truncated": true, "bytes": 4097,
           "sha256": "4e369b5618643c3abddd027b650bfa54810be3b418028a7c9d82299a59d008e8", "head": {"$repeat": "a", "times": 256}}}},
        {"event": "executor_tool", "round": 1, "name": "Edit", "tool_use_id": "toolu_4", "denied": true,
         "arguments": {"file_path": "app.txt", "old_string": "before\n", "new_string": {"truncated": true, "bytes": 4500,
           "sha256": "3ff87d665f793b7cfcd231ab6e639af7e7576dc2606825b784683391bfe3fb72", "head": {"$repeat": "€", "times": 85}}}},
        {"event": "executor_tool", "round": 1, "name": "Write", "tool_use_id": "toolu_5", "denied": true,
         "arguments": {"file_path": "env.txt", "content": {"truncated": true, "bytes": 5022,
           "sha256": "95f856f42f3cf710526c8b840ef592dd1ea9dc0ddaf4ca1dd1df529e67f85ba4", "head": {"$repeat": "z", "times": 256}}}}
      ]
      """

  Scenario: Arguments whose encoding exceeds 65536 bytes keep only their size and hash
    When a "build" round makes these tool calls:
      """json
      [
        {"name": "TodoWrite", "input": {"todos": [
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "y", "times": 1474}]}},
        {"name": "TodoWrite", "input": {"todos": [
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "y", "times": 1475}]}}
      ]
      """
    Then the round's tool records are:
      """json
      [
        {"event": "executor_tool", "round": 1, "name": "TodoWrite", "tool_use_id": "toolu_1", "denied": false,
         "arguments": {"todos": [
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000}, {"$repeat": "x", "times": 4000},
          {"$repeat": "y", "times": 1474}]}},
        {"event": "executor_tool", "round": 1, "name": "TodoWrite", "tool_use_id": "toolu_2", "denied": false,
         "arguments": {"truncated": true, "bytes": 65537, "sha256": "312dbe8530ac1a7f703d616acc8b34615d7cc341e2856bf5dbe60dfb96d5cde3"}}
      ]
      """

  Scenario Outline: A known secret pattern in a command is redacted before the run log
    Given the adapter environment has "DEPLOY_TOKEN" set to "env-held-FAKE-value-5678"
    And the adapter environment has "TINY_SECRET" set to "8charsOK"
    And the stored Claude Code token is "kogen-stored-FAKE-token-1234"
    When a "build" round runs the command: <command>
    Then no run-log event contains "<secret>"
    And the Bash command is logged as: <logged>

    Examples:
      | command                                                                                      | logged                                                                         | secret                              |
      | curl -sS https://example.invalid/?t=kogen-stored-FAKE-token-1234                             | curl -sS https://example.invalid/?t=[redacted]                                 | kogen-stored-FAKE-token-1234        |
      | echo env-held-FAKE-value-5678                                                                | echo [redacted]                                                                | env-held-FAKE-value-5678            |
      | echo 8charsOK                                                                                | echo [redacted]                                                                | 8charsOK                            |
      | GITHUB_TOKEN=plainFAKEvalue99 gh api user                                                    | GITHUB_TOKEN=[redacted] gh api user                                            | plainFAKEvalue99                    |
      | export ANTHROPIC_API_KEY='quoted FAKE value' && make                                         | export ANTHROPIC_API_KEY=[redacted] && make                                    | quoted FAKE value                   |
      | deploy --api-key=flagFAKEvalue42 --verbose                                                   | deploy --api-key=[redacted] --verbose                                          | flagFAKEvalue42                     |
      | mysql --password hunterFAKE2 -h db                                                           | mysql --password [redacted] -h db                                              | hunterFAKE2                         |
      | curl -H "Authorization: Bearer eyFAKEheader.eyFAKEbody.FAKEsig" https://api.example.invalid | curl -H "Authorization: Bearer [redacted]" https://api.example.invalid        | eyFAKEheader.eyFAKEbody.FAKEsig     |
      | curl -H 'Authorization: Basic a29nZW46RkFLRXBhc3M=' https://example.invalid                 | curl -H 'Authorization: Basic [redacted]' https://example.invalid             | a29nZW46RkFLRXBhc3M=                |
      | git clone https://kogen:urlFAKEpass@github.com/KogenAI/x.git                                 | git clone https://kogen:[redacted]@github.com/KogenAI/x.git                    | urlFAKEpass                         |
      | echo ghp_FAKEFAKEFAKEFAKEFAKE00                                                              | echo [redacted]                                                                | ghp_FAKEFAKEFAKEFAKEFAKE00          |
      | echo github_pat_FAKE0FAKE0FAKE0FAKE0FAKE                                                     | echo [redacted]                                                                | github_pat_FAKE0FAKE0FAKE0FAKE0FAKE |
      | echo sk-ant-FAKE-kogen-00000                                                                 | echo [redacted]                                                                | sk-ant-FAKE-kogen-00000             |
      | echo AKIAFAKEFAKEFAKE0000                                                                    | echo [redacted]                                                                | AKIAFAKEFAKEFAKE0000                |
      | echo xoxb-FAKE-0000-kogen                                                                    | echo [redacted]                                                                | xoxb-FAKE-0000-kogen                |
