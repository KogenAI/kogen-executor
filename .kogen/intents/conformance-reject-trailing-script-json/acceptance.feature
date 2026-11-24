Feature: Reject trailing content in embedded conformance scripts
  This feature exercises the public Scripts loader with controlled embedded bytes
  in an isolated copy, without changing the repository's embedded scripts.

  Scenario: Accept a single object followed by whitespace
    Given conformance-reject-trailing-script-json: the isolated embedded file "finish_after_write.json" has these JSON-encoded bytes:
      """
      "{\"name\":\"finish_after_write\"} \t\r\n"
      """
    When conformance-reject-trailing-script-json: I load the embedded scripts through Scripts
    Then conformance-reject-trailing-script-json: loading succeeds with script "finish_after_write"

  Scenario: Reject a second JSON value
    Given conformance-reject-trailing-script-json: the isolated embedded file "finish_after_write.json" has these JSON-encoded bytes:
      """
      "{\"name\":\"finish_after_write\"} {\"name\":\"another\"}"
      """
    When conformance-reject-trailing-script-json: I load the embedded scripts through Scripts
    Then conformance-reject-trailing-script-json: loading fails with an error naming "finish_after_write.json"

  Scenario: Reject non-whitespace garbage
    Given conformance-reject-trailing-script-json: the isolated embedded file "finish_after_write.json" has these JSON-encoded bytes:
      """
      "{\"name\":\"finish_after_write\"} garbage"
      """
    When conformance-reject-trailing-script-json: I load the embedded scripts through Scripts
    Then conformance-reject-trailing-script-json: loading fails with an error naming "finish_after_write.json"
