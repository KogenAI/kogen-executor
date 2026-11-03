Feature: A failed Claude Code round reports what its result line spent

  Scenario: An error result with usage reports its usage, turns, subtype and terminal reason
    When the failed-usage adapter runs these rounds:
      """json
      [[{"type":"result","subtype":"error_during_execution","is_error":true,"terminal_reason":"api_error","result":"boom","num_turns":7,"total_cost_usd":0.25,
         "usage":{"input_tokens":10,"cache_read_input_tokens":20,"cache_creation_input_tokens":5,"output_tokens":7},"session_id":"@SID@"}]]
      """
    Then the failed-usage terminal events are:
      """json
      [{"event":"executor_round_failed","role":"build","round":1,"reason":"failed",
        "detail":"Claude Code reported an error result: subtype \"error_during_execution\", terminal reason \"api_error\"","deadline_remaining_ms":null,
        "usage":{"state":"complete","source":"harness","input":35,"cached":20,"output":7,"reasoning":null,"cost_usd":0.25,"model":"claude-sonnet-5-5"},
        "num_turns":7,"subtype":"error_during_execution","terminal_reason":"api_error"}]
      """

  Scenario: The same error result without usage fields has no usage keys
    When the failed-usage adapter runs these rounds:
      """json
      [[{"type":"result","subtype":"error_during_execution","is_error":true,"terminal_reason":"api_error","result":"boom","num_turns":7,"session_id":"@SID@"}]]
      """
    Then the failed-usage terminal events are:
      """json
      [{"event":"executor_round_failed","role":"build","round":1,"reason":"failed",
        "detail":"Claude Code reported an error result: subtype \"error_during_execution\", terminal reason \"api_error\"","deadline_remaining_ms":null,
        "num_turns":7,"subtype":"error_during_execution","terminal_reason":"api_error"}]
      """

  Scenario: Fields the result did not report stay unknown or absent, never zero
    When the failed-usage adapter runs these rounds:
      """json
      [[{"type":"result","subtype":"error_during_execution","is_error":true,"result":"boom","usage":{"output_tokens":7},"session_id":"@SID@"}]]
      """
    Then the failed-usage terminal events are:
      """json
      [{"event":"executor_round_failed","role":"build","round":1,"reason":"failed",
        "detail":"Claude Code reported an error result: subtype \"error_during_execution\"","deadline_remaining_ms":null,
        "usage":{"state":"partial","source":"harness","input":null,"cached":null,"output":7,"reasoning":null,"cost_usd":null,"model":"claude-sonnet-5-5"},
        "subtype":"error_during_execution"}]
      """

  Scenario: A usage-limit result keeps its reason and reports its usage
    When the failed-usage adapter runs these rounds:
      """json
      [[{"type":"assistant","error":"rate_limit","message":{"content":[]}},
        {"type":"result","subtype":"success","is_error":true,"terminal_reason":"api_error","result":"API Error","num_turns":2,"total_cost_usd":0.05,
         "usage":{"input_tokens":3,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":1},"session_id":"@SID@"}]]
      """
    Then the failed-usage terminal events are:
      """json
      [{"event":"executor_round_failed","role":"build","round":1,"reason":"usage_limit",
        "detail":"Claude Code reported an error result: subtype \"success\", terminal reason \"api_error\"","deadline_remaining_ms":null,
        "usage":{"state":"complete","source":"harness","input":3,"cached":0,"output":1,"reasoning":null,"cost_usd":0.05,"model":"claude-sonnet-5-5"},
        "num_turns":2,"subtype":"success","terminal_reason":"api_error"}]
      """

  Scenario: A success result's ended event is unchanged byte for byte
    When the failed-usage adapter runs these rounds:
      """json
      [[{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@","num_turns":3,"terminal_reason":"completed","total_cost_usd":0.1,
         "usage":{"input_tokens":1,"cache_read_input_tokens":2,"cache_creation_input_tokens":3,"output_tokens":4}}]]
      """
    Then the failed-usage terminal event lines are exactly:
      """
      {"claude_code_version":"2.1.312","deadline_remaining_ms":null,"ending":"finish","event":"executor_round_ended","model":"claude-sonnet-5-5","num_turns":3,"permission_denials":0,"role":"build","round":1,"session_id":"@SID@","terminal_reason":"completed","usage":{"cached":2,"cost_usd":0.1,"input":6,"model":"claude-sonnet-5-5","output":4,"reasoning":null,"source":"harness","state":"complete"}}
      """

  Scenario: A failed later round's cost is the delta since the previous round
    When the failed-usage adapter runs these rounds:
      """json
      [[{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@","num_turns":3,"terminal_reason":"completed","total_cost_usd":0.1,
         "usage":{"input_tokens":1,"cache_read_input_tokens":2,"cache_creation_input_tokens":3,"output_tokens":4}}],
       [{"type":"result","subtype":"error_during_execution","is_error":true,"terminal_reason":"api_error","result":"boom","num_turns":7,"total_cost_usd":0.25,
         "usage":{"input_tokens":10,"cache_read_input_tokens":20,"cache_creation_input_tokens":5,"output_tokens":7},"session_id":"@SID@"}]]
      """
    Then the failed-usage terminal events are:
      """json
      [{"claude_code_version":"2.1.312","deadline_remaining_ms":null,"ending":"finish","event":"executor_round_ended","model":"claude-sonnet-5-5","num_turns":3,"permission_denials":0,"role":"build","round":1,"session_id":"@SID@","terminal_reason":"completed",
        "usage":{"cached":2,"cost_usd":0.1,"input":6,"model":"claude-sonnet-5-5","output":4,"reasoning":null,"source":"harness","state":"complete"}},
       {"event":"executor_round_failed","role":"build","round":2,"reason":"failed",
        "detail":"Claude Code reported an error result: subtype \"error_during_execution\", terminal reason \"api_error\"","deadline_remaining_ms":null,
        "usage":{"state":"complete","source":"harness","input":35,"cached":20,"output":7,"reasoning":null,"cost_usd":0.15,"model":"claude-sonnet-5-5"},
        "num_turns":7,"subtype":"error_during_execution","terminal_reason":"api_error"}]
      """

  Scenario: A stream that ends without a result has no usage keys and keeps its reason
    When the failed-usage adapter runs these rounds:
      """json
      [[]]
      """
    Then the failed-usage terminal events are:
      """json
      [{"event":"executor_round_failed","role":"build","round":1,"reason":"protocol",
        "detail":"the event stream ended without a result event","deadline_remaining_ms":null}]
      """
