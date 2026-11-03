Feature: Retain bounded per-round rate-limit state in run logs
  Scenario: Last report wins and a new round starts empty
    When the limit-state adapter receives these rounds:
      """json
      [[{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","rateLimitType":"five_hour","resetsAt":1800000000}},
        {"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","rateLimitType":"seven_day","resetsAt":1800001000,"account":"PRIVATE","utilization":0.9}},
        {"type":"rate_limit_event"},
        {"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@"}],
       [{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@"}]]
      """
    Then the limit-state terminal summaries are:
      """json
      [{"reason":"","rate_limit_event_count":3,"rate_limit_info":{"status":"allowed_warning","rateLimitType":"seven_day","resetsAt":1800001000}},{"reason":""}]
      """

  Scenario: A later status without optional fields clears their old values
    When the limit-state adapter receives these rounds:
      """json
      [[{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","rateLimitType":"five_hour","resetsAt":1800000000}},
        {"type":"rate_limit_event","rate_limit_info":{"status":"rejected"}},
        {"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@"}]]
      """
    Then the limit-state terminal summaries are:
      """json
      [{"reason":"","rate_limit_event_count":2,"rate_limit_info":{"status":"rejected"}}]
      """

  Scenario: Bare events are counted without inventing state
    When the limit-state adapter receives these rounds:
      """json
      [[{"type":"rate_limit_event"},{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@"}]]
      """
    Then the limit-state terminal summaries are:
      """json
      [{"reason":"","rate_limit_event_count":1}]
      """

  Scenario Outline: Failure logging retains state without changing classification
    When the limit-state adapter receives these rounds:
      """json
      [[{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","rateLimitType":"five_hour","resetsAt":1800000000,"account":"PRIVATE"}},
        {"type":"assistant","error":"<assistant>","message":{"content":[]}},
        {"type":"result","subtype":"success","is_error":true,"terminal_reason":"api_error","result":"API unavailable","session_id":"@SID@"}]]
      """
    Then the limit-state terminal summaries are:
      """json
      [{"reason":"<reason>","rate_limit_event_count":1,"rate_limit_info":{"status":"rejected","rateLimitType":"five_hour","resetsAt":1800000000}}]
      """
    Examples:
      | assistant  | reason      |
      | other      | failed      |
      | rate_limit | usage_limit |

  Scenario: Events after result still break the stream protocol
    When the limit-state adapter receives these rounds:
      """json
      [[{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@"},{"type":"rate_limit_event"}]]
      """
    Then the limit-state terminal summaries are:
      """json
      [{"reason":"protocol"}]
      """
