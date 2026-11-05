Feature: Dropped protected entries with invalid UTF-8 stay bounded and complete
  Entries are given as byte parts: a string is UTF-8 text, {"bytes":"ff"} is a raw byte and
  {"repeat":n,"of":[...]} repeats its parts. Expected entries are compared after Go's JSON
  marshalling of the executor_started event, and the event must hold only valid UTF-8 before it.

  Scenario: An invalid byte early in a long entry does not cut the entry short
    When fix-k-exec-protected-paths-dropped-visible: Start receives protected entry bytes:
      """
      [["/elsewhere/", {"bytes":"ff"}, {"repeat":300,"of":["a"]}]]
      """
    Then fix-k-exec-protected-paths-dropped-visible: the dropped entries after JSON marshalling are:
      """
      [{"entry":["/elsewhere/�", {"repeat":242,"of":["a"]}],"reason":"outside_checkout"}]
      """

  Scenario: A leading invalid byte does not empty the entry
    When fix-k-exec-protected-paths-dropped-visible: Start receives protected entry bytes:
      """
      [[{"bytes":"ff"}, "/../../x", {"repeat":300,"of":["a"]}]]
      """
    Then fix-k-exec-protected-paths-dropped-visible: the dropped entries after JSON marshalling are:
      """
      [{"entry":["�/../../x", {"repeat":245,"of":["a"]}],"reason":"outside_checkout"}]
      """

  Scenario: A short entry with invalid bytes stays within 256 bytes after marshalling
    When fix-k-exec-protected-paths-dropped-visible: Start receives protected entry bytes:
      """
      [["/elsewhere/", {"repeat":120,"of":[{"bytes":"ff"}, "a"]}]]
      """
    Then fix-k-exec-protected-paths-dropped-visible: the dropped entries after JSON marshalling are:
      """
      [{"entry":["/elsewhere/", {"repeat":61,"of":["�a"]}],"reason":"outside_checkout"}]
      """
