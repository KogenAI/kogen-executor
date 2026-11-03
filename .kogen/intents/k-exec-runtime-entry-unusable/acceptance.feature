Feature: Reject unusable managed runtime entries
  Scenario Outline: Existing unusable entries require user removal
    When k-exec-runtime-entry-unusable: I start with "<kind>"
    Then k-exec-runtime-entry-unusable: it names the unusable entry without changing it
    When k-exec-runtime-entry-unusable: I remove the named folder and start again
    Then k-exec-runtime-entry-unusable: start succeeds with 1 downloads
    Examples:
      | kind      |
      | dangling  |
      | directory |
      | empty     |
      | 0644      |

  Scenario: Valid pinned runtime needs no download
    When k-exec-runtime-entry-unusable: I start with "valid"
    Then k-exec-runtime-entry-unusable: start succeeds with 0 downloads

  Scenario: Absent runtime installs from the test origin
    When k-exec-runtime-entry-unusable: I start with "valid"
    Then k-exec-runtime-entry-unusable: start succeeds with 0 downloads
    When k-exec-runtime-entry-unusable: I remove the named folder and start again
    Then k-exec-runtime-entry-unusable: start succeeds with 1 downloads
