Feature: Correct round cost baselines across gaps and resets
  Scenario Outline: Synthetic cost sequences
    When k-exec-cost-baseline-gaps: mapping these rounds:
      """
      <rounds>
      """
    Then k-exec-cost-baseline-gaps: usage is:
      """
      <usage>
      """
    Examples:
      | rounds | usage |
      | [{"total":0.10},{"total":0.25},{"total":0.40}] | [{"cost":0.10,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":0.15,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":0.15,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"}] |
      | [{"total":0.10},{"total":null},{"total":0.40}] | [{"cost":0.10,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"}] |
      | [{"total":0.10},{"total":null},{"total":0.40},{"total":0.55}] | [{"cost":0.10,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":0.15,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"}] |
      | [{"total":0.50},{"total":0.20},{"total":0.35}] | [{"cost":0.50,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":0.15,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"}] |
      | [{"total":0.10},{"total":0.10}] | [{"cost":0.10,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":0,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"}] |

  Scenario: Token state is independent of unknown cost
    When k-exec-cost-baseline-gaps: mapping these rounds:
      """
      [{"total":null,"tokens":"complete"},{"total":0.40,"tokens":"partial"},{"total":0.20}]
      """
    Then k-exec-cost-baseline-gaps: usage is:
      """
      [{"cost":null,"input":6,"cached":2,"output":4,"reasoning":null,"state":"complete"},{"cost":null,"input":null,"cached":null,"output":4,"reasoning":null,"state":"partial"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"}]
      """

  Scenario: Failed events do not mutate baseline or gap
    When k-exec-cost-baseline-gaps: mapping these rounds:
      """
      [{"total":0.10},{"total":0.25,"failed":true},{"total":0.40},{"total":null,"failed":true,"tokens":"partial"},{"total":0.55},{"total":null},{"total":0.70,"failed":true},{"total":0.80},{"total":0.95}]
      """
    Then k-exec-cost-baseline-gaps: usage is:
      """
      [{"cost":0.10,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":0.15,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":0.30,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":4,"reasoning":null,"state":"partial"},{"cost":0.15,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":null,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"},{"cost":0.15,"input":null,"cached":null,"output":null,"reasoning":null,"state":"unknown"}]
      """
