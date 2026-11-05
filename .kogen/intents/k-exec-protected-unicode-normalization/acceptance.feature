Feature: Protected paths match names that differ only in Unicode normalization form
  The step writes a hook policy for a temporary checkout $T/<root> (root is its real path; no
  protected_ids) and runs the real pretool hook (claudecode.RunHook in a driver process) once per
  call: a Write tool call with that file_path and the working directory $T/<root>. Strings in the
  JSON are written with escapes: é is the composed é (NFC), é is e plus the combining
  acute accent (NFD), É is the composed É. A logged path is the resolved path with $T for the
  temporary directory; it keeps the call's own spelling.

  Scenario: A composed protected file is denied under its decomposed spelling
    When k-exec-protected-unicode-normalization: the pretool hook runs these Write calls in a temporary checkout:
      """
      {"root":"r","protected":["café.txt"],
       "calls":["café.txt","café.txt","cafe.txt","CAFÉ.TXT","$T/r/café.txt"]}
      """
    Then k-exec-protected-unicode-normalization: the hook answers:
      """
      [
        {"path":"café.txt","decision":"deny","reason":"Kogen: this is a protected path (café.txt)"},
        {"path":"café.txt","decision":"deny","reason":"Kogen: this is a protected path (café.txt)"},
        {"path":"cafe.txt","decision":"allow","reason":""},
        {"path":"CAFÉ.TXT","decision":"deny","reason":"Kogen: this is a protected path (café.txt)"},
        {"path":"$T/r/café.txt","decision":"deny","reason":"Kogen: this is a protected path (café.txt)"}
      ]
      """
    And k-exec-protected-unicode-normalization: the hook log holds, each with the run nonce and a time:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","path":"$T/r/café.txt","decision":"deny","reason":"this is a protected path (café.txt)"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","path":"$T/r/café.txt","decision":"deny","reason":"this is a protected path (café.txt)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","path":"$T/r/cafe.txt","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","path":"$T/r/CAFÉ.TXT","decision":"deny","reason":"this is a protected path (café.txt)"},
        {"hook":"pretool","tool_use_id":"w4","tool_name":"Write","path":"$T/r/café.txt","decision":"deny","reason":"this is a protected path (café.txt)"}
      ]
      """

  Scenario: A decomposed protected file is denied under its composed spelling
    When k-exec-protected-unicode-normalization: the pretool hook runs these Write calls in a temporary checkout:
      """
      {"root":"r","protected":["café.txt"],
       "calls":["café.txt","café.txt","CAFÉ.TXT","cafe.txt"]}
      """
    Then k-exec-protected-unicode-normalization: the hook answers:
      """
      [
        {"path":"café.txt","decision":"deny","reason":"Kogen: this is a protected path (café.txt)"},
        {"path":"café.txt","decision":"deny","reason":"Kogen: this is a protected path (café.txt)"},
        {"path":"CAFÉ.TXT","decision":"deny","reason":"Kogen: this is a protected path (café.txt)"},
        {"path":"cafe.txt","decision":"allow","reason":""}
      ]
      """
    And k-exec-protected-unicode-normalization: the hook log holds, each with the run nonce and a time:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","path":"$T/r/café.txt","decision":"deny","reason":"this is a protected path (café.txt)"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","path":"$T/r/café.txt","decision":"deny","reason":"this is a protected path (café.txt)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","path":"$T/r/CAFÉ.TXT","decision":"deny","reason":"this is a protected path (café.txt)"},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","path":"$T/r/cafe.txt","decision":"allow"}
      ]
      """

  Scenario: A different name stays allowed next to a non-ASCII protected file
    When k-exec-protected-unicode-normalization: the pretool hook runs these Write calls in a temporary checkout:
      """
      {"root":"r","protected":["café.txt"],
       "calls":["cafe.txt","cafè.txt","cafè.txt","café.txt.bak"]}
      """
    Then k-exec-protected-unicode-normalization: the hook answers:
      """
      [
        {"path":"cafe.txt","decision":"allow","reason":""},
        {"path":"cafè.txt","decision":"allow","reason":""},
        {"path":"cafè.txt","decision":"allow","reason":""},
        {"path":"café.txt.bak","decision":"allow","reason":""}
      ]
      """
    And k-exec-protected-unicode-normalization: the hook log holds, each with the run nonce and a time:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","path":"$T/r/cafe.txt","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","path":"$T/r/cafè.txt","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","path":"$T/r/cafè.txt","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","path":"$T/r/café.txt.bak","decision":"allow"}
      ]
      """

  Scenario: A protected directory spelled composed covers calls below it in the decomposed form
    When k-exec-protected-unicode-normalization: the pretool hook runs these Write calls in a temporary checkout:
      """
      {"root":"r","protected":["dép/"],
       "calls":["dép/file.go","dép/file.go","DÉP/sub/x.go","dep/file.go","dépot/file.go"]}
      """
    Then k-exec-protected-unicode-normalization: the hook answers:
      """
      [
        {"path":"dép/file.go","decision":"deny","reason":"Kogen: this is a protected path (dép/)"},
        {"path":"dép/file.go","decision":"deny","reason":"Kogen: this is a protected path (dép/)"},
        {"path":"DÉP/sub/x.go","decision":"deny","reason":"Kogen: this is a protected path (dép/)"},
        {"path":"dep/file.go","decision":"allow","reason":""},
        {"path":"dépot/file.go","decision":"allow","reason":""}
      ]
      """
    And k-exec-protected-unicode-normalization: the hook log holds, each with the run nonce and a time:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","path":"$T/r/dép/file.go","decision":"deny","reason":"this is a protected path (dép/)"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","path":"$T/r/dép/file.go","decision":"deny","reason":"this is a protected path (dép/)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","path":"$T/r/DÉP/sub/x.go","decision":"deny","reason":"this is a protected path (dép/)"},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","path":"$T/r/dep/file.go","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w4","tool_name":"Write","path":"$T/r/dépot/file.go","decision":"allow"}
      ]
      """

  Scenario: The checkout-root containment and .git tests use the same comparison as protected entries
    When k-exec-protected-unicode-normalization: the pretool hook runs these Write calls in a temporary checkout:
      """
      {"root":"ré","protected":["café.txt"],
       "calls":["$T/ré/notes.txt","$T/ré/café.txt","$T/ré/.git/config","$T/ré/notes.txt","$T/re/notes.txt","notes.txt"]}
      """
    Then k-exec-protected-unicode-normalization: the hook answers:
      """
      [
        {"path":"$T/ré/notes.txt","decision":"allow","reason":""},
        {"path":"$T/ré/café.txt","decision":"deny","reason":"Kogen: this is a protected path (café.txt)"},
        {"path":"$T/ré/.git/config","decision":"deny","reason":"Kogen: paths under .git are not editable"},
        {"path":"$T/ré/notes.txt","decision":"allow","reason":""},
        {"path":"$T/re/notes.txt","decision":"deny","reason":"Kogen: the path is outside the checkout"},
        {"path":"notes.txt","decision":"allow","reason":""}
      ]
      """
    And k-exec-protected-unicode-normalization: the hook log holds, each with the run nonce and a time:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","path":"$T/ré/notes.txt","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","path":"$T/ré/café.txt","decision":"deny","reason":"this is a protected path (café.txt)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","path":"$T/ré/.git/config","decision":"deny","reason":"paths under .git are not editable"},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","path":"$T/ré/notes.txt","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w4","tool_name":"Write","path":"$T/re/notes.txt","decision":"deny","reason":"the path is outside the checkout"},
        {"hook":"pretool","tool_use_id":"w5","tool_name":"Write","path":"$T/ré/notes.txt","decision":"allow"}
      ]
      """

  Scenario: ASCII-only entries and calls give today's answers and identical hook log records
    When k-exec-protected-unicode-normalization: the pretool hook runs these Write calls in a temporary checkout:
      """
      {"root":"r","protected":["notes.txt","locked/"],
       "calls":["notes.txt","NOTES.TXT","$T/r/notes.txt","../r/notes.txt","notes.txt.bak","locked/a.go","lockedx/a.go",".git/config",".GIT/HEAD","sub/.git/config",".github/ci.yml","$T/elsewhere/x.txt",""]}
      """
    Then k-exec-protected-unicode-normalization: the hook answers:
      """
      [
        {"path":"notes.txt","decision":"deny","reason":"Kogen: this is a protected path (notes.txt)"},
        {"path":"NOTES.TXT","decision":"deny","reason":"Kogen: this is a protected path (notes.txt)"},
        {"path":"$T/r/notes.txt","decision":"deny","reason":"Kogen: this is a protected path (notes.txt)"},
        {"path":"../r/notes.txt","decision":"deny","reason":"Kogen: this is a protected path (notes.txt)"},
        {"path":"notes.txt.bak","decision":"allow","reason":""},
        {"path":"locked/a.go","decision":"deny","reason":"Kogen: this is a protected path (locked/)"},
        {"path":"lockedx/a.go","decision":"allow","reason":""},
        {"path":".git/config","decision":"deny","reason":"Kogen: paths under .git are not editable"},
        {"path":".GIT/HEAD","decision":"deny","reason":"Kogen: paths under .git are not editable"},
        {"path":"sub/.git/config","decision":"deny","reason":"Kogen: paths under .git are not editable"},
        {"path":".github/ci.yml","decision":"allow","reason":""},
        {"path":"$T/elsewhere/x.txt","decision":"deny","reason":"Kogen: the path is outside the checkout"},
        {"path":"","decision":"deny","reason":"Kogen: the tool call names no file path"}
      ]
      """
    And k-exec-protected-unicode-normalization: the hook log holds, each with the run nonce and a time:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","path":"$T/r/notes.txt","decision":"deny","reason":"this is a protected path (notes.txt)"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","path":"$T/r/NOTES.TXT","decision":"deny","reason":"this is a protected path (notes.txt)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","path":"$T/r/notes.txt","decision":"deny","reason":"this is a protected path (notes.txt)"},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","path":"$T/r/notes.txt","decision":"deny","reason":"this is a protected path (notes.txt)"},
        {"hook":"pretool","tool_use_id":"w4","tool_name":"Write","path":"$T/r/notes.txt.bak","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w5","tool_name":"Write","path":"$T/r/locked/a.go","decision":"deny","reason":"this is a protected path (locked/)"},
        {"hook":"pretool","tool_use_id":"w6","tool_name":"Write","path":"$T/r/lockedx/a.go","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w7","tool_name":"Write","path":"$T/r/.git/config","decision":"deny","reason":"paths under .git are not editable"},
        {"hook":"pretool","tool_use_id":"w8","tool_name":"Write","path":"$T/r/.GIT/HEAD","decision":"deny","reason":"paths under .git are not editable"},
        {"hook":"pretool","tool_use_id":"w9","tool_name":"Write","path":"$T/r/sub/.git/config","decision":"deny","reason":"paths under .git are not editable"},
        {"hook":"pretool","tool_use_id":"w10","tool_name":"Write","path":"$T/r/.github/ci.yml","decision":"allow"},
        {"hook":"pretool","tool_use_id":"w11","tool_name":"Write","path":"$T/elsewhere/x.txt","decision":"deny","reason":"the path is outside the checkout"},
        {"hook":"pretool","tool_use_id":"w12","tool_name":"Write","decision":"deny","reason":"the tool call names no file path"}
      ]
      """
