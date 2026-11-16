Feature: Hook denial events in the run log name their reason and path

  This feature drives the real Claude Code adapter with a fake Claude Code and the real pretool hook.

  Scenario: A hook denial of a protected file names its reason and path
    When exec-hook-deny-events-name-reason: a fake Claude round runs:
      """
      {"Calls":[{"ID":"d1","Path":"protected/contract.txt","Answer":true}]}
      """
    Then exec-hook-deny-events-name-reason: the deny hook event reason is "this is a protected path (protected/contract.txt)"
    And exec-hook-deny-events-name-reason: the deny hook event path is the path of the deny record in the hook log
    And exec-hook-deny-events-name-reason: the deny hook event path ends with "protected/contract.txt"

  Scenario: A denial for a write outside the checkout shows the hook's reason and not the tool result text
    When exec-hook-deny-events-name-reason: a fake Claude round runs:
      """
      {"Calls":[{"ID":"d1","Path":"../outside.txt","Answer":true}]}
      """
    Then exec-hook-deny-events-name-reason: the deny hook event reason is "the path is outside the checkout"
    And exec-hook-deny-events-name-reason: the deny hook event reason is not the tool result text
    And exec-hook-deny-events-name-reason: the deny hook event path is the path of the deny record in the hook log

  Scenario: A denial reported only when the round's result arrives carries the same fields
    When exec-hook-deny-events-name-reason: a fake Claude round runs:
      """
      {"Calls":[{"ID":"d1","Path":".git/config","Answer":false}]}
      """
    Then exec-hook-deny-events-name-reason: the deny hook event reason is "paths under .git are not editable"
    And exec-hook-deny-events-name-reason: the deny hook event path is the path of the deny record in the hook log

  Scenario: A denial whose hook record has no path has no path key
    When exec-hook-deny-events-name-reason: a fake Claude round runs:
      """
      {"Calls":[{"ID":"d1","Path":"b.txt","HookPath":"-","Answer":false}]}
      """
    Then exec-hook-deny-events-name-reason: the deny hook event reason is "the tool call names no file path"
    And exec-hook-deny-events-name-reason: the deny hook event has no path key

  Scenario: Allow events keep their keys and the model still receives the Kogen-prefixed reason
    When exec-hook-deny-events-name-reason: a fake Claude round runs:
      """
      {"Calls":[{"ID":"a1","Path":"ok.txt","Answer":true},{"ID":"d1","Path":"../outside.txt","Answer":true}]}
      """
    Then exec-hook-deny-events-name-reason: every allow hook event has exactly the keys "decision,event,hook,round,tool_name,tool_use_id"
    And exec-hook-deny-events-name-reason: the model-facing hook output for the deny call is "the path is outside the checkout"
