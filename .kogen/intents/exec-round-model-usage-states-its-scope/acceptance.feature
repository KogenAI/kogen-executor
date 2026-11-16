Feature: A round's model usage says its scope and carries the round's own figures

  This feature drives the Claude Code adapter's round events with result lines that carry modelUsage and total_cost_usd.

  Scenario: A second round reports its own per-model figures
    When exec-round-model-usage-states-its-scope: the round usage driver runs the "second-round" scenario
    Then exec-round-model-usage-states-its-scope: the second round event says its model_usage is session scoped and reports only the round difference

  Scenario: The first round equals its totals and a model new in a later round starts at zero
    When exec-round-model-usage-states-its-scope: the round usage driver runs the "per-model-baseline" scenario
    Then exec-round-model-usage-states-its-scope: each model is measured against its own baseline and a new model starts at zero

  Scenario: A failed round does not move the baseline
    When exec-round-model-usage-states-its-scope: the round usage driver runs the "failed-round" scenario
    Then exec-round-model-usage-states-its-scope: the failed round event leaves the baseline where the last successful round put it

  Scenario: A counter that goes down is left out and the lower value becomes the baseline
    When exec-round-model-usage-states-its-scope: the round usage driver runs the "counter-reset" scenario
    Then exec-round-model-usage-states-its-scope: a counter that went down is left out and its lower value becomes the baseline

  Scenario: Without modelUsage in the result the event has neither new key
    When exec-round-model-usage-states-its-scope: the round usage driver runs the "absent" scenario
    Then exec-round-model-usage-states-its-scope: an event without modelUsage has neither new key and a later round measures from zero
