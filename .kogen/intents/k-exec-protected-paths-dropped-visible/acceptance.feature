Feature: Visible dropped protection inputs
  Scenario: Usable entries retain normalization and order
    When k-exec-protected-paths-dropped-visible: Start receives protected entries:
      """
      ["a/b.txt", " ./c ", "$ROOT/d/e"]
      """
    Then k-exec-protected-paths-dropped-visible: the outcome is:
      """
      {"policy":["a/b.txt","c","d/e"]}
      """

  Scenario: Empty and outside entries are visible but nonfatal
    When k-exec-protected-paths-dropped-visible: Start receives protected entries:
      """
      ["a.txt", "", "/elsewhere/f"]
      """
    Then k-exec-protected-paths-dropped-visible: the outcome is:
      """
      {"policy":["a.txt"],"count":2,"dropped":[{"entry":"","reason":"empty"},{"entry":"/elsewhere/f","reason":"outside_checkout"}]}
      """

  Scenario: Other start fields are unchanged by protected inputs
    When k-exec-protected-paths-dropped-visible: Start receives protected entries:
      """
      []
      """
    Then k-exec-protected-paths-dropped-visible: remember the unchanged start fields
    When k-exec-protected-paths-dropped-visible: Start receives protected entries:
      """
      ["a.txt", "", "/elsewhere/f"]
      """
    Then k-exec-protected-paths-dropped-visible: only dropped metadata differs from the remembered start
    Then k-exec-protected-paths-dropped-visible: the outcome is:
      """
      {"policy":["a.txt"],"count":2,"dropped":[{"entry":"","reason":"empty"},{"entry":"/elsewhere/f","reason":"outside_checkout"}]}
      """

  Scenario Outline: Root and ancestors are refused without artifacts
    When k-exec-protected-paths-dropped-visible: Start receives protected entries:
      """
      ["a.txt", "<entry>"]
      """
    Then k-exec-protected-paths-dropped-visible: the outcome is:
      """
      {"reason":"unavailable","entry":"<entry>"}
      """
    Examples:
      | entry     |
      | .         |
      | ..        |
      | $ROOT     |
      | $ROOT/..  |
      | /         |

  Scenario: Whitespace and escaping sibling are nonfatal
    When k-exec-protected-paths-dropped-visible: Start receives protected entries:
      """
      ["a.txt", "  ", "../x"]
      """
    Then k-exec-protected-paths-dropped-visible: the outcome is:
      """
      {"policy":["a.txt"],"count":2,"dropped":[{"entry":"  ","reason":"empty"},{"entry":"../x","reason":"outside_checkout"}]}
      """

  Scenario Outline: Lists stop at twenty without truncating the count
    When k-exec-protected-paths-dropped-visible: Start receives protected entries:
      """
      {"repeat":<count>,"entry":"/elsewhere/$I"}
      """
    Then k-exec-protected-paths-dropped-visible: the outcome is:
      """
      {"policy":null,"count":<count>,"generate":"/elsewhere/$I"}
      """
    Examples:
      | count |
      | 20    |
      | 21    |
      | 100   |

  Scenario: Dropped entry text is bounded
    When k-exec-protected-paths-dropped-visible: Start receives protected entries:
      """
      ["a.txt", "/elsewhere/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz"]
      """
    Then k-exec-protected-paths-dropped-visible: the outcome is:
      """
      {"policy":["a.txt"],"count":1,"dropped":[{"entry":"/elsewhere/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijk","reason":"outside_checkout"}]}
      """
