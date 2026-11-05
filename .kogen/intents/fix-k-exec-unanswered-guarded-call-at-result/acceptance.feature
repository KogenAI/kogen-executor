Feature: Validate all unanswered guarded calls before reporting them, in tool_use order

  Scenario: A later failing call stops the round before an earlier allowed call is reported
    When fix-k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Calls":[{"ID":"call-a","Decision":"allow","Changed":true},{"ID":"call-b","Decision":"none","Changed":true}],"Iterations":24}
      """
    Then fix-k-exec-unanswered-guarded-call-at-result: every iteration ends with:
      """
      {"iterations":24,"error":"hook did not run for the Write call \"call-b\"","events":[]}
      """

  Scenario: The first failing call in tool_use order is reported
    When fix-k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Calls":[{"ID":"call-a","Decision":"allow","Changed":true},{"ID":"call-b","Decision":"none","Changed":true},{"ID":"call-c","Decision":"none","Changed":true}],"Iterations":24}
      """
    Then fix-k-exec-unanswered-guarded-call-at-result: every iteration ends with:
      """
      {"iterations":24,"error":"hook did not run for the Write call \"call-b\"","events":[]}
      """

  Scenario: Accepted unanswered calls are reported in tool_use order
    When fix-k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Calls":[{"ID":"call-6","Decision":"allow","Changed":true},{"ID":"call-1","Decision":"allow","Changed":true},{"ID":"call-5","Decision":"allow","Changed":true},{"ID":"call-2","Decision":"allow","Changed":true},{"ID":"call-4","Decision":"allow","Changed":true},{"ID":"call-3","Decision":"allow","Changed":true}],"Iterations":24}
      """
    Then fix-k-exec-unanswered-guarded-call-at-result: every iteration ends with:
      """
      {"iterations":24,"events":["hook call-6 allow","tool call-6 unanswered","hook call-1 allow","tool call-1 unanswered","hook call-5 allow","tool call-5 unanswered","hook call-2 allow","tool call-2 unanswered","hook call-4 allow","tool call-4 unanswered","hook call-3 allow","tool call-3 unanswered"]}
      """
