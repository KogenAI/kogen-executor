Feature: The executor artifact directory is not writable through the agent's file tools
  A fake Claude Code (the package's test binary) runs Start in a temporary directory $ABS.
  The checkout is $ABS/r: the conformance checkout with the protected file protected/contract.txt,
  plus the directories src/ and .run/ and the relative symlink alias -> .run/exec.
  $ABS/outside is a directory outside the checkout and $ABS/via is a symlink to $ABS/r/.run.
  The pretool hook runs on the policy Start wrote, with the working directory $ABS/r.

  Scenario: An artifact directory inside the checkout is recorded and denied by every spelling
    When k-exec-artifact-dir-inside-checkout: Start runs with:
      """
      {"dir":"r/.run/exec","writes":[
        "$ABS/r/.run/exec/hook-policy.json",
        "$ABS/r/.run/exec/hook-log.jsonl",
        "$ABS/r/.run/exec/claude-settings.json",
        "$ABS/r/alias/hook-policy.json",
        ".run/exec/hook-policy.json",
        "$ABS/r/src/x.go",
        "$ABS/r/.run/other.txt",
        "$ABS/r/protected/contract.txt"
      ]}
      """
    Then k-exec-artifact-dir-inside-checkout: the start event records artifact_dir_in_checkout true
    And k-exec-artifact-dir-inside-checkout: the start event has exactly the keys:
      """
      ["artifact_dir_in_checkout","auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-inside-checkout: the hook policy without its nonce is:
      """
      {"root":"$ABS/r","protected":["protected/contract.txt"],"log":"$ABS/r/.run/exec/hook-log.jsonl","artifact_dir":"$ABS/r/.run/exec"}
      """
    And k-exec-artifact-dir-inside-checkout: the pretool hook answers:
      """
      [
        {"path":"$ABS/r/.run/exec/hook-policy.json","decision":"deny","reason":"Kogen: this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"path":"$ABS/r/.run/exec/hook-log.jsonl","decision":"deny","reason":"Kogen: this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"path":"$ABS/r/.run/exec/claude-settings.json","decision":"deny","reason":"Kogen: this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"path":"$ABS/r/alias/hook-policy.json","decision":"deny","reason":"Kogen: this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"path":".run/exec/hook-policy.json","decision":"deny","reason":"Kogen: this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"path":"$ABS/r/src/x.go","decision":"allow","reason":""},
        {"path":"$ABS/r/.run/other.txt","decision":"allow","reason":""},
        {"path":"$ABS/r/protected/contract.txt","decision":"deny","reason":"Kogen: this is a protected path (protected/contract.txt)"}
      ]
      """

  Scenario Outline: An artifact directory outside the checkout changes nothing
    When k-exec-artifact-dir-inside-checkout: Start runs with:
      """
      {"dir":"<dir>","writes":["$ABS/r/src/x.go","$ABS/<dir>/hook-policy.json"]}
      """
    Then k-exec-artifact-dir-inside-checkout: the start event has no artifact_dir_in_checkout key
    And k-exec-artifact-dir-inside-checkout: the start event has exactly the keys:
      """
      ["auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-inside-checkout: the hook policy without its nonce is:
      """
      {"root":"$ABS/r","protected":["protected/contract.txt"],"log":"$ABS/<dir>/hook-log.jsonl"}
      """
    And k-exec-artifact-dir-inside-checkout: the pretool hook answers:
      """
      [
        {"path":"$ABS/r/src/x.go","decision":"allow","reason":""},
        {"path":"$ABS/<dir>/hook-policy.json","decision":"deny","reason":"Kogen: the path is outside the checkout"}
      ]
      """
    Examples:
      | dir          |
      | outside/exec |
      | r2/exec      |

  Scenario Outline: The checkout itself or a parent of it as artifact directory denies every checkout write
    When k-exec-artifact-dir-inside-checkout: Start runs with:
      """
      {"dir":"<dir>","writes":["$ABS/r/src/x.go","$ABS/r/alias/hook-policy.json","$ABS/outside/f"]}
      """
    Then k-exec-artifact-dir-inside-checkout: the start event records artifact_dir_in_checkout true
    And k-exec-artifact-dir-inside-checkout: the hook policy without its nonce is:
      """
      {"root":"$ABS/r","protected":["protected/contract.txt"],"log":"<shown>/hook-log.jsonl","artifact_dir":"<shown>"}
      """
    And k-exec-artifact-dir-inside-checkout: the pretool hook answers:
      """
      [
        {"path":"$ABS/r/src/x.go","decision":"deny","reason":"Kogen: this is the executor artifact directory (<shown>)"},
        {"path":"$ABS/r/alias/hook-policy.json","decision":"deny","reason":"Kogen: this is the executor artifact directory (<shown>)"},
        {"path":"$ABS/outside/f","decision":"deny","reason":"Kogen: the path is outside the checkout"}
      ]
      """
    Examples:
      | dir | shown  |
      | r   | $ABS/r |
      | .   | $ABS   |

  Scenario: An artifact directory spelled through a symlink outside the checkout is resolved first
    When k-exec-artifact-dir-inside-checkout: Start runs with:
      """
      {"dir":"via/exec","writes":["$ABS/via/exec/hook-policy.json","$ABS/r/.run/exec/hook-log.jsonl","$ABS/r/src/x.go"]}
      """
    Then k-exec-artifact-dir-inside-checkout: the start event records artifact_dir_in_checkout true
    And k-exec-artifact-dir-inside-checkout: the hook policy without its nonce is:
      """
      {"root":"$ABS/r","protected":["protected/contract.txt"],"log":"$ABS/via/exec/hook-log.jsonl","artifact_dir":"$ABS/r/.run/exec"}
      """
    And k-exec-artifact-dir-inside-checkout: the pretool hook answers:
      """
      [
        {"path":"$ABS/via/exec/hook-policy.json","decision":"deny","reason":"Kogen: this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"path":"$ABS/r/.run/exec/hook-log.jsonl","decision":"deny","reason":"Kogen: this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"path":"$ABS/r/src/x.go","decision":"allow","reason":""}
      ]
      """

  Scenario: In a round, writes to the artifact directory are denied and logged while the hooks keep appending
    When k-exec-artifact-dir-inside-checkout: Start runs with:
      """
      {"dir":"r/.run/exec","round":{"actions":[
        {"write":{"path":"src/x.go","content":"package x\n"}},
        {"write":{"path":".run/exec/hook-policy.json","content":"{}\n"}},
        {"write":{"path":".run/exec/hook-log.jsonl","content":"forged\n"}},
        {"write":{"path":"alias/hook-policy.json","content":"{}\n"}},
        {"shell":"true"}
      ]}}
      """
    Then k-exec-artifact-dir-inside-checkout: the start event records artifact_dir_in_checkout true
    And k-exec-artifact-dir-inside-checkout: the round succeeds and leaves the hook policy file unchanged
    And k-exec-artifact-dir-inside-checkout: the round reports:
      """
      {
        "hooks":[
          {"tool_use_id":"toolu_1_0","decision":"allow"},
          {"tool_use_id":"toolu_1_1","decision":"deny"},
          {"tool_use_id":"toolu_1_2","decision":"deny"},
          {"tool_use_id":"toolu_1_3","decision":"deny"}
        ],
        "writes":[
          {"tool_use_id":"toolu_1_0","denied":false},
          {"tool_use_id":"toolu_1_1","denied":true},
          {"tool_use_id":"toolu_1_2","denied":true},
          {"tool_use_id":"toolu_1_3","denied":true}
        ]
      }
      """
    And k-exec-artifact-dir-inside-checkout: the hook log holds, each with the run nonce:
      """
      [
        {"hook":"pretool","tool_use_id":"toolu_1_0","tool_name":"Write","decision":"allow","path":"$ABS/r/src/x.go","reason":""},
        {"hook":"pretool","tool_use_id":"toolu_1_1","tool_name":"Write","decision":"deny","path":"$ABS/r/.run/exec/hook-policy.json","reason":"this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"hook":"pretool","tool_use_id":"toolu_1_2","tool_name":"Write","decision":"deny","path":"$ABS/r/.run/exec/hook-log.jsonl","reason":"this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"hook":"pretool","tool_use_id":"toolu_1_3","tool_name":"Write","decision":"deny","path":"$ABS/r/.run/exec/hook-policy.json","reason":"this is the executor artifact directory ($ABS/r/.run/exec)"},
        {"hook":"posttool","tool_use_id":"toolu_1_4","tool_name":"Bash","decision":"observed","path":"","reason":""}
      ]
      """

  Scenario: The liveness check still stops a guarded call the hook did not see
    When k-exec-artifact-dir-inside-checkout: Start runs with:
      """
      {"dir":"r/.run/exec","round":{"skip_hook":true,"actions":[{"write":{"path":"src/x.go","content":"package x\n"}}]}}
      """
    Then k-exec-artifact-dir-inside-checkout: the start event records artifact_dir_in_checkout true
    And k-exec-artifact-dir-inside-checkout: the round fails as "protocol" with a detail containing 'hook did not run for the Write call "toolu_1_0"'
    And k-exec-artifact-dir-inside-checkout: the hook log holds, each with the run nonce:
      """
      []
      """
