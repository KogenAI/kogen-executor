Feature: Absolute protected paths under a symlinked checkout path
  The temporary directory $ABS holds the checkout at real/ (with a/b.txt, c/, inner -> c, out -> $ABS/elsewhere)
  and a symlink link -> $ABS/real; $ABS/elsewhere is a directory outside the checkout.

  Scenario: Task root through the link keeps an entry spelled through the link
    When k-exec-protected-absolute-path-symlinked-root: Start runs with:
      """
      {"root":"link","protected":["$ABS/link/a/b.txt"]}
      """
    Then k-exec-protected-absolute-path-symlinked-root: Start succeeds with the policy:
      """
      ["a/b.txt"]
      """
    And k-exec-protected-absolute-path-symlinked-root: the start event lists no dropped entries

  Scenario: Resolved task root keeps an entry spelled through the link
    When k-exec-protected-absolute-path-symlinked-root: Start runs with:
      """
      {"root":"real","protected":["$ABS/link/a/b.txt"]}
      """
    Then k-exec-protected-absolute-path-symlinked-root: Start succeeds with the policy:
      """
      ["a/b.txt"]
      """
    And k-exec-protected-absolute-path-symlinked-root: the start event lists no dropped entries

  Scenario: An entry whose final components do not exist yet is kept
    When k-exec-protected-absolute-path-symlinked-root: Start runs with:
      """
      {"root":"link","protected":["$ABS/link/not-yet/created.txt"]}
      """
    Then k-exec-protected-absolute-path-symlinked-root: Start succeeds with the policy:
      """
      ["not-yet/created.txt"]
      """
    And k-exec-protected-absolute-path-symlinked-root: the start event lists no dropped entries

  Scenario Outline: An entry outside both spellings is still dropped
    When k-exec-protected-absolute-path-symlinked-root: Start runs with:
      """
      {"root":"<root>","protected":["$ABS/elsewhere/f"]}
      """
    Then k-exec-protected-absolute-path-symlinked-root: Start succeeds with the policy:
      """
      []
      """
    And k-exec-protected-absolute-path-symlinked-root: the start event drops:
      """
      [{"entry":"$ABS/elsewhere/f","reason":"outside_checkout"}]
      """
    Examples:
      | root |
      | link |
      | real |

  Scenario Outline: The link itself resolves to the checkout root and is refused
    When k-exec-protected-absolute-path-symlinked-root: Start runs with:
      """
      {"root":"<root>","protected":["a/b.txt","$ABS/link"]}
      """
    Then k-exec-protected-absolute-path-symlinked-root: Start is refused as "unavailable" naming "root_or_parent: $ABS/link"
    Examples:
      | root |
      | link |
      | real |

  Scenario: The pretool hook denies writes to both spellings of the protected file
    When k-exec-protected-absolute-path-symlinked-root: Start runs with:
      """
      {"root":"link","protected":["$ABS/link/a/b.txt"],"writes":["$ABS/real/a/b.txt","$ABS/link/a/b.txt","$ABS/real/a/other.txt"]}
      """
    Then k-exec-protected-absolute-path-symlinked-root: Start succeeds with the policy:
      """
      ["a/b.txt"]
      """
    And k-exec-protected-absolute-path-symlinked-root: the pretool hook answers:
      """
      [
        {"path":"$ABS/real/a/b.txt","decision":"deny","reason":"Kogen: this is a protected path (a/b.txt)"},
        {"path":"$ABS/link/a/b.txt","decision":"deny","reason":"Kogen: this is a protected path (a/b.txt)"},
        {"path":"$ABS/real/a/other.txt","decision":"allow","reason":""}
      ]
      """

  Scenario: Every spelling of a checkout path yields its relative spelling's entry
    When k-exec-protected-absolute-path-symlinked-root: Start runs with:
      """
      {"root":"link","protected":["inner/x","$ABS/real/inner/x","$ABS/link/inner/x","a/b.txt"," ./a/b.txt ","$ABS/real/a/b.txt","$ABS/real/out/f"]}
      """
    Then k-exec-protected-absolute-path-symlinked-root: Start succeeds with the policy:
      """
      ["inner/x","inner/x","inner/x","a/b.txt","a/b.txt","a/b.txt","out/f"]
      """
    And k-exec-protected-absolute-path-symlinked-root: the start event lists no dropped entries
