Feature: Record context compactions within a round
  Scenario: Two boundaries preserve metadata without conversation content
    When k-exec-context-reset-events: a round streams:
      """
      [{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"auto","pre_tokens":180000},"message":"private-message"},{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"manual"},"message":"private-message"}]
      """
    Then k-exec-context-reset-events: the log is:
      """
      {"events":[{"event":"executor_context_compacted","role":"build","round":1,"trigger":"auto","pre_tokens":180000},{"event":"executor_context_compacted","role":"build","round":1,"trigger":"manual","pre_tokens":null}],"count":2}
      """
  Scenario: No compaction
    When k-exec-context-reset-events: a round streams:
      """
      []
      """
    Then k-exec-context-reset-events: the log is:
      """
      {"events":[],"count":0}
      """
  Scenario: Non-object metadata is ignored safely
    When k-exec-context-reset-events: a round streams:
      """
      [{"type":"system","subtype":"compact_boundary","compact_metadata":"private-message"}]
      """
    Then k-exec-context-reset-events: the log is:
      """
      {"events":[],"count":0}
      """
  Scenario: Unrecognised and malformed boundaries do not count
    When k-exec-context-reset-events: a round streams:
      """
      [{"type":"system","subtype":"compact_unknown","compact_metadata":{"trigger":"auto","pre_tokens":100}},{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":42,"pre_tokens":100}},{"type":"system","subtype":"compact_boundary"}]
      """
    Then k-exec-context-reset-events: the log is:
      """
      {"events":[],"count":0}
      """
