Feature: k-exec-contract-wire-goldens: executor owns its wire snapshots
  Scenario: Pin current production rendering and reject description drift
    Then k-exec-contract-wire-goldens: the executor gate rejects drift and preserves baseline golden bytes
  Scenario: Keep the change test-only
    Then k-exec-contract-wire-goldens: production CLI dependencies and timeouts are unchanged
