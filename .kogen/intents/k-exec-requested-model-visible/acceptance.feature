Feature: Requested and observed round model telemetry
  Scenario Outline: Attribute each terminal round without changing its outcome
    When k-exec-requested-model-visible: I run a "<mode>" round requesting "<requested>" observing "<observed>"
    Then k-exec-requested-model-visible: the telemetry preserves the round with a 256 byte text limit
    Examples:
      | mode  | requested                            | observed                             |
      | ok    | alias-a                              | full-id-a                            |
      | error | alias-a                              | full-id-a                            |
      | early | alias-a                              | full-id-a                            |
      | ok    |                                      | full-id-a                            |
      | ok    | alias-a                              | LONG                                 |
      | ok    | LONG                                 | full-id-a                            |
      | ok    | prefix-SYNTHETIC-model-secret-suffix  | prefix-SYNTHETIC-model-secret-suffix  |
      | error | prefix-SYNTHETIC-model-secret-suffix  | prefix-SYNTHETIC-model-secret-suffix  |
