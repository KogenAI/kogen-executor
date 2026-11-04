Feature: Check unanswered guarded calls before accepting a round
  Scenario Outline: Reject missing hook evidence after a write
    When k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Name":"<name>","Decision":"none","Changed":true,"Ending":"<ending>"}
      """
    Then k-exec-unanswered-guarded-call-at-result: the outcome is:
      """
      {"error":"hook did not run"}
      """
    Examples:
      | name         | ending  |
      | Write        | finish  |
      | Edit         | finish  |
      | MultiEdit    | no_call |
      | NotebookEdit | blocker |

  Scenario: Accept a missing hook when no write happened
    When k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Name":"Write","Decision":"none","Changed":false,"Ending":"finish"}
      """
    Then k-exec-unanswered-guarded-call-at-result: the outcome is:
      """
      {"ending":"finish","events":1,"name":"Write","denied":false}
      """

  Scenario: Reject a denied write that ran
    When k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Name":"Write","Decision":"deny","Changed":true,"Ending":"finish"}
      """
    Then k-exec-unanswered-guarded-call-at-result: the outcome is:
      """
      {"error":"was denied by the hook but ran"}
      """

  Scenario: Report an unchanged denied call
    When k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Name":"Write","Decision":"deny","Changed":false,"Ending":"finish"}
      """
    Then k-exec-unanswered-guarded-call-at-result: the outcome is:
      """
      {"ending":"finish","events":1,"name":"Write","denied":true}
      """

  Scenario Outline: Accept allowed unanswered writes at any accepted ending
    When k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Name":"Write","Decision":"allow","Changed":true,"Ending":"<ending>"}
      """
    Then k-exec-unanswered-guarded-call-at-result: the outcome is:
      """
      {"ending":"<ending>","events":1,"name":"Write","denied":false}
      """
    Examples:
      | ending  |
      | finish  |
      | no_call |
      | blocker |

  Scenario: Reject an unobservable target without hook evidence
    When k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Name":"Write","Decision":"none","Unobservable":true,"Ending":"finish"}
      """
    Then k-exec-unanswered-guarded-call-at-result: the outcome is:
      """
      {"error":"hook did not run"}
      """

  Scenario: Preserve unanswered Read behavior
    When k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Name":"Read","Decision":"none","Ending":"finish"}
      """
    Then k-exec-unanswered-guarded-call-at-result: the outcome is:
      """
      {"ending":"finish","events":0}
      """

  Scenario: Do not report an answered call as unanswered
    When k-exec-unanswered-guarded-call-at-result: a fake round runs:
      """
      {"Name":"Write","Decision":"allow","Changed":true,"Answered":true,"Ending":"finish"}
      """
    Then k-exec-unanswered-guarded-call-at-result: the outcome is:
      """
      {"ending":"finish","events":1,"name":"Write","denied":false,"answered":true}
      """
