Feature: Show denied permission calls
  Scenario: List names and inputs
    When k-exec-permission-denials-visible: a result is emitted:
      """
      {"permission_denials":[{"tool_name":"WebFetch","tool_use_id":"u1","tool_input":{"url":"https://example.invalid/"}},{"tool_name":"Unknown"}]}
      """
    Then k-exec-permission-denials-visible: the terminal event is:
      """
      {"failed":false,"event":"executor_round_ended","fields":{"ending":"finish","permission_denials":2,"permission_denials_omitted":0,"permission_denial_calls":[{"name":"WebFetch","tool_use_id":"u1","arguments":{"url":"https://example.invalid/"}},{"name":"Unknown","arguments":null}]}}
      """
  Scenario Outline: Cap ordered calls
    When k-exec-permission-denials-visible: a result is emitted:
      """
      {"repeat":<total>}
      """
    Then k-exec-permission-denials-visible: the terminal event is:
      """
      {"failed":false,"event":"executor_round_ended","repeat":<listed>,"fields":{"permission_denials":<total>,"permission_denials_omitted":<omitted>}}
      """
    Examples:
      | total | listed | omitted |
      | 31 | 31 | 0 |
      | 32 | 32 | 0 |
      | 33 | 32 | 1 |
      | 200 | 32 | 168 |
  Scenario Outline: Sanitize and skip malformed entries on either ending
    When k-exec-permission-denials-visible: a result is emitted:
      """
      {"is_error":<failed>,"permission_denials":[42,{"tool_name":"WebFetch","tool_input":{"api_key":"s3cret","text":"stored-token-fixture-987654"}}]}
      """
    Then k-exec-permission-denials-visible: the terminal event is:
      """
      {"failed":<failed>,"event":"<event>","fields":{<outcome>,"usage":{"state":"complete","source":"harness","input":10,"cached":0,"output":2,"reasoning":null,"cost_usd":null,"model":"claude-sonnet-5-5"},"permission_denials":2,"permission_denials_omitted":1,"permission_denial_calls":[{"name":"WebFetch","arguments":{"api_key":"[redacted]","text":"[redacted]"}}]}}
      """
    Examples:
      | failed | event | outcome |
      | false | executor_round_ended | "ending":"finish" |
      | true | executor_round_failed | "reason":"failed" |
  Scenario: No denial key
    When k-exec-permission-denials-visible: a result is emitted:
      """
      {}
      """
    Then k-exec-permission-denials-visible: the terminal event is:
      """
      {"failed":false,"event":"executor_round_ended","fields":{"permission_denials":0},"absent":["permission_denial_calls","permission_denials_omitted"]}
      """
  Scenario: Empty denials
    When k-exec-permission-denials-visible: a result is emitted:
      """
      {"permission_denials":[]}
      """
    Then k-exec-permission-denials-visible: the terminal event is:
      """
      {"failed":false,"event":"executor_round_ended","fields":{"permission_denials":0,"permission_denial_calls":[],"permission_denials_omitted":0}}
      """
