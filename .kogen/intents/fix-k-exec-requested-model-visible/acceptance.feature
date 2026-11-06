Feature: Round model telemetry omits an unobserved model and its unit test checks field order
  Rounds run through the fake Claude Code. The init model is given as JSON; null removes the
  init event's "model" key.

  Scenario Outline: An init without a non-empty model string omits model from the terminal event
    When fix-k-exec-requested-model-visible: a "<mode>" round requesting "alias-a" receives init model JSON "full-id-a"
    Then fix-k-exec-requested-model-visible: the terminal event reports requested model "alias-a" and model "full-id-a"
    When fix-k-exec-requested-model-visible: a "<mode>" round requesting "alias-a" receives init model JSON <init>
    Then fix-k-exec-requested-model-visible: the terminal event reports requested model "alias-a" and omits model
    Examples:
      | mode  | init |
      | ok    | null |
      | ok    | ""   |
      | ok    | 7    |
      | error | null |
      | error | ""   |

  Scenario: TestRoundModelProjection catches swapped model fields
    When fix-k-exec-requested-model-visible: TestRoundModelProjection runs on the tree as built
    Then fix-k-exec-requested-model-visible: TestRoundModelProjection passes
    When fix-k-exec-requested-model-visible: TestRoundModelProjection runs with addModels swapping requested_model and model
    Then fix-k-exec-requested-model-visible: TestRoundModelProjection fails
