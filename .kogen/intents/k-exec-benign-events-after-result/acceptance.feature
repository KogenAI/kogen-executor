Feature: Keep completed rounds across benign trailing events
  Scenario Outline: Accept exactly the benign tail kinds
    When k-exec-benign-events-after-result: a completed round has these trailing lines:
      """
      <lines>
      """
    Then k-exec-benign-events-after-result: the outcome is:
      """
      {"reason":"","detail":"","event":"executor_round_ended","ending":"finish","claim":"done","count":<count>,"usage":{"input":120,"cached":20,"output":30,"cost_usd":0.01},"rateLimit":<snapshot>,"rateCount":<rateCount>}
      """
    Examples:
      | lines | count | snapshot | rateCount |
      | [] | 0 | null | 0 |
      | ["{\"type\":\"system\",\"subtype\":\"hook_started\"}"] | 1 | null | 0 |
      | ["{\"type\":\"system\",\"subtype\":\"hook_response\"}"] | 1 | null | 0 |
      | ["{\"type\":\"system\",\"subtype\":\"plugin_install\"}"] | 1 | null | 0 |
      | ["{\"type\":\"rate_limit_event\",\"rate_limit_info\":{\"status\":\"allowed_warning\",\"rateLimitType\":\"five_hour\",\"resetsAt\":123}}"] | 1 | {"status":"allowed_warning","rateLimitType":"five_hour","resetsAt":123} | 1 |
      | ["{\"type\":\"rate_limit_event\",\"rate_limit_info\":{\"status\":\"allowed\"}}","{\"type\":\"system\",\"subtype\":\"hook_response\"}","{\"type\":\"rate_limit_event\",\"rate_limit_info\":{\"status\":\"allowed_warning\",\"rateLimitType\":\"five_hour\",\"resetsAt\":123}}"] | 3 | {"status":"allowed_warning","rateLimitType":"five_hour","resetsAt":123} | 2 |

  Scenario Outline: Reject content and invalid lines after a result
    When k-exec-benign-events-after-result: a completed round has these trailing lines:
      """
      ["<line>"]
      """
    Then k-exec-benign-events-after-result: the outcome is:
      """
      {"reason":"protocol","detail":"the event stream continued after its result","event":"executor_round_failed"}
      """
    Examples:
      | line |
      | {\"type\":\"result\",\"subtype\":\"success\",\"result\":\"second\"} |
      | {\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"late\"}]}} |
      | {\"type\":\"user\"} |
      | {\"type\":\"unknown\"} |
      | {\"type\":\"system\",\"subtype\":\"init\"} |
      | {\"type\":\"system\",\"subtype\":\"compact_boundary\"} |
      | {\"type\":\"system\",\"subtype\":\"unknown\"} |
      | not JSON |
      | [] |
      | null |
      | 42 |
