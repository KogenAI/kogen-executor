Feature: A round stopped because a hook did not run names why

  The fake Claude Code makes a guarded Write call "hook-call" that writes note.txt without a hook
  log record, scripting the hook events of that call between its tool_use and its tool_result.

  Scenario: A hook that exited 2 with stderr is named with its exit code and excerpt
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"},
        {"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","output":"kogen executor hook: invalid policy\n","stdout":"","stderr":"kogen executor hook: invalid policy\n","exit_code":2,"outcome":"error"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause exit_2; hook_stderr \"kogen executor hook: invalid policy\"",
       "hook_cause":"exit_2","hook_stderr":"kogen executor hook: invalid policy"}
      """

  Scenario: A hook response with outcome timeout is named timeout
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"},
        {"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","output":"","stdout":"","stderr":"","outcome":"timeout"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause timeout",
       "hook_cause":"timeout","hook_stderr":null}
      """

  Scenario: The pinned runtime's timed-out hook response (outcome cancelled, null exit code) is named timeout
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"},
        {"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","output":"","stdout":"","stderr":"still waiting on the policy\n","exit_code":null,"outcome":"cancelled"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause timeout; hook_stderr \"still waiting on the policy\"",
       "hook_cause":"timeout","hook_stderr":"still waiting on the policy"}
      """

  Scenario: A hook that started without a response is named no_response
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause no_response",
       "hook_cause":"no_response","hook_stderr":null}
      """

  Scenario: A call without hook events is named not_started
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause not_started",
       "hook_cause":"not_started","hook_stderr":null}
      """

  Scenario: The stored token in hook stderr is redacted in the excerpt
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"},
        {"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","output":"","stdout":"","stderr":"kogen executor hook: cannot write the hook log; token stored-token-fixture-987654\n","exit_code":2,"outcome":"error"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause exit_2; hook_stderr \"kogen executor hook: cannot write the hook log; token [redacted]\"",
       "hook_cause":"exit_2","hook_stderr":"kogen executor hook: cannot write the hook log; token [redacted]"}
      """

  Scenario: A round whose hooks all ran keeps today's event stream
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"Logged":true}
      """
    Then k-exec-hook-failure-cause-visible: the round succeeds with today's events:
      """
      {"events":[
        ["executor_started",["auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]],
        ["executor_round_started",["event","resume","role","round","session_id"]],
        ["executor_hook",["decision","event","hook","round","tool_name","tool_use_id"]],
        ["executor_tool",["arguments","denied","event","name","result_bytes","result_error","result_items","round","tool_use_id"]],
        ["executor_round_ended",["claude_code_version","compactions","deadline_remaining_ms","ending","event","init_ms","max_line_gap_ms","model","num_turns","permission_denial_calls","permission_denials","permission_denials_omitted","requested_model","role","round","session_id","terminal_reason","usage","wall_ms"]]]}
      """

  Scenario: Hook events of an earlier logged call are not the cause of a later call
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"Logged":true,"HookCall":true,"Answered":true,"Events":[]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause not_started",
       "hook_cause":"not_started","hook_stderr":null}
      """

  Scenario: An unanswered changed call at the result is named too
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"Logged":true,"HookCall":true,"Answered":false,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause no_response",
       "hook_cause":"no_response","hook_stderr":null}
      """

  Scenario: A hook response without an exit code or timeout is named exit_unknown
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"},
        {"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","output":"","stdout":"","stderr":"","outcome":"error"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause exit_unknown",
       "hook_cause":"exit_unknown","hook_stderr":null}
      """

  Scenario: A stderr excerpt of exactly 200 bytes is kept whole
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"},
        {"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","output":"","stdout":"","stderr":"<x*200>\n","exit_code":1,"outcome":"error"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause exit_1; hook_stderr \"<x*200>\"",
       "hook_cause":"exit_1","hook_stderr":"<x*200>"}
      """

  Scenario: A longer stderr excerpt is bounded to 200 bytes
    When k-exec-hook-failure-cause-visible: a fake Claude Code round runs:
      """
      {"HookCall":true,"Answered":true,"Events":[
        {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse"},
        {"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PreToolUse:Write","hook_event":"PreToolUse","output":"","stdout":"","stderr":"<x*201>\n","exit_code":1,"outcome":"error"}]}
      """
    Then k-exec-hook-failure-cause-visible: the round fails with:
      """
      {"detail":"hook did not run for the Write call \"hook-call\"; the round was stopped; hook_cause exit_1; hook_stderr \"<x*200>...\"",
       "hook_cause":"exit_1","hook_stderr":"<x*200>..."}
      """
