Feature: Per-model result observation
  Scenario: Two models do not change accounting
    When k-exec-result-model-usage: the result patch is:
      """
      {"modelUsage":{"main":{"inputTokens":10,"cacheReadInputTokens":2,"outputTokens":3,"costUSD":0.12},"helper":{"inputTokens":4,"cacheReadInputTokens":0,"outputTokens":1,"costUSD":0.02}}}
      """
    Then k-exec-result-model-usage: the observation is:
      """
      {"failed":false,"fields":{"model_usage":[{"model":"helper","input":4,"cached":0,"output":1,"cost_usd":0.02},{"model":"main","input":10,"cached":2,"output":3,"cost_usd":0.12}]},"absent":["model_usage_omitted"]}
      """
  Scenario: Invalid numeric fields are independently omitted
    When k-exec-result-model-usage: the result patch is:
      """
      {"modelUsage":{"a":{"inputTokens":0,"cacheReadInputTokens":-1,"outputTokens":"3","costUSD":-0.1},"b":{"inputTokens":2,"cacheReadInputTokens":0,"outputTokens":1,"costUSD":"0.2"}}}
      """
    Then k-exec-result-model-usage: the observation is:
      """
      {"failed":false,"fields":{"model_usage":[{"model":"a","input":0},{"model":"b","input":2,"cached":0,"output":1}]}}
      """
  Scenario Outline: Malformed or absent breakdowns are harmless
    When k-exec-result-model-usage: the result patch is:
      """
      <patch>
      """
    Then k-exec-result-model-usage: the observation is:
      """
      {"failed":false,"fields":{},"absent":["model_usage","model_usage_omitted"]}
      """
    Examples:
      | patch |
      | {} |
      | {"modelUsage":"bad"} |
      | {"modelUsage":[]} |
      | {"modelUsage":{}} |
      | {"modelUsage":{"bad":3}} |
  Scenario Outline: Model count is capped deterministically
    When k-exec-result-model-usage: the result patch is:
      """
      {"generate":<count>}
      """
    Then k-exec-result-model-usage: the observation is:
      """
      {"failed":false,"generate":<kept>,"omitted":<omitted>,"fields":{}}
      """
    Examples:
      | count | kept | omitted |
      | 19 | 19 | 0 |
      | 20 | 20 | 0 |
      | 21 | 20 | 1 |
  Scenario Outline: Model id byte bounds
    When k-exec-result-model-usage: the result patch is:
      """
      {"idBytes":<size>}
      """
    Then k-exec-result-model-usage: the observation is:
      """
      {"failed":false,"idBytes":<size>,"bound":256,"fields":{}}
      """
    Examples:
      | size |
      | 255 |
      | 256 |
      | 1024 |
  Scenario: Failed result retains observation
    When k-exec-result-model-usage: the result patch is:
      """
      {"subtype":"error_during_execution","is_error":true,"result":"synthetic failure","modelUsage":{"helper":{"inputTokens":4,"costUSD":0.02}}}
      """
    Then k-exec-result-model-usage: the observation is:
      """
      {"failed":true,"fields":{"model_usage":[{"model":"helper","input":4,"cost_usd":0.02}]}}
      """
