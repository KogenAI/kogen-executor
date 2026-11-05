Feature: A protected file is also protected under its other hard-link names
  A fake Claude Code (the package's test binary) runs Start for a temporary checkout $ABS/r
  (the conformance checkout, with the task's protected entries replaced by the scenario's).
  $ABS/outside is a directory outside the checkout. The "before" fixture steps run before Start
  writes the hook policy, the "after" steps run after it in order: "link" is os.Link(old, new),
  "symlink" is os.Symlink(target, name), "rename" is os.Rename(old, new), and "write" calls the
  real pretool hook directly with a Write tool call for that file_path, with the working directory
  $ABS/r. "links" is the target's link count (following symlinks) when the hook ran.

  Scenario: A hard link to a protected file is denied while unlinked names, copies and unrelated links stay allowed
    When k-exec-protected-hardlink-alias: Start runs and then:
      """
      {"protected":["locked.txt"],
       "before":[
        {"file":"locked.txt","content":"locked\n"},
        {"link":["locked.txt","alias.txt"]},
        {"file":"plain.txt","content":"plain\n"},
        {"file":"copy.txt","content":"locked\n"},
        {"file":"pair-a.txt","content":"pair\n"},
        {"link":["pair-a.txt","pair-b.txt"]}
       ],
       "after":[
        {"write":"alias.txt"},
        {"write":"$ABS/r/alias.txt"},
        {"write":"plain.txt"},
        {"write":"copy.txt"},
        {"write":"pair-b.txt"},
        {"write":"locked.txt"}
       ]}
      """
    Then k-exec-protected-hardlink-alias: the pretool hook answers:
      """
      [
        {"path":"alias.txt","links":2,"decision":"deny","reason":"Kogen: this is a hard link to a protected path (locked.txt)"},
        {"path":"$ABS/r/alias.txt","links":2,"decision":"deny","reason":"Kogen: this is a hard link to a protected path (locked.txt)"},
        {"path":"plain.txt","links":1,"decision":"allow","reason":""},
        {"path":"copy.txt","links":1,"decision":"allow","reason":""},
        {"path":"pair-b.txt","links":2,"decision":"allow","reason":""},
        {"path":"locked.txt","links":2,"decision":"deny","reason":"Kogen: this is a protected path (locked.txt)"}
      ]
      """
    And k-exec-protected-hardlink-alias: the hook log holds, each with the run nonce:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","decision":"deny","path":"$ABS/r/alias.txt","reason":"this is a hard link to a protected path (locked.txt)"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","decision":"deny","path":"$ABS/r/alias.txt","reason":"this is a hard link to a protected path (locked.txt)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","decision":"allow","path":"$ABS/r/plain.txt","reason":""},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","decision":"allow","path":"$ABS/r/copy.txt","reason":""},
        {"hook":"pretool","tool_use_id":"w4","tool_name":"Write","decision":"allow","path":"$ABS/r/pair-b.txt","reason":""},
        {"hook":"pretool","tool_use_id":"w5","tool_name":"Write","decision":"deny","path":"$ABS/r/locked.txt","reason":"this is a protected path (locked.txt)"}
      ]
      """
    And k-exec-protected-hardlink-alias: the files keep their contents:
      """
      {"locked.txt":"locked\n","plain.txt":"plain\n","copy.txt":"locked\n","pair-a.txt":"pair\n"}
      """

  Scenario: A protected file with one link keeps its path denial, and a hard link made after Start is denied
    When k-exec-protected-hardlink-alias: Start runs and then:
      """
      {"protected":["not-yet.txt","locked.txt"],
       "before":[
        {"file":"locked.txt","content":"locked\n"}
       ],
       "after":[
        {"write":"locked.txt"},
        {"link":["locked.txt","later.txt"]},
        {"write":"later.txt"},
        {"write":"locked.txt"}
       ]}
      """
    Then k-exec-protected-hardlink-alias: the pretool hook answers:
      """
      [
        {"path":"locked.txt","links":1,"decision":"deny","reason":"Kogen: this is a protected path (locked.txt)"},
        {"path":"later.txt","links":2,"decision":"deny","reason":"Kogen: this is a hard link to a protected path (locked.txt)"},
        {"path":"locked.txt","links":2,"decision":"deny","reason":"Kogen: this is a protected path (locked.txt)"}
      ]
      """
    And k-exec-protected-hardlink-alias: the hook log holds, each with the run nonce:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","decision":"deny","path":"$ABS/r/locked.txt","reason":"this is a protected path (locked.txt)"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","decision":"deny","path":"$ABS/r/later.txt","reason":"this is a hard link to a protected path (locked.txt)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","decision":"deny","path":"$ABS/r/locked.txt","reason":"this is a protected path (locked.txt)"}
      ]
      """
    And k-exec-protected-hardlink-alias: the files keep their contents:
      """
      {"locked.txt":"locked\n"}
      """

  Scenario: Hard links to files inside a protected directory, made from outside it, are denied naming the directory
    When k-exec-protected-hardlink-alias: Start runs and then:
      """
      {"protected":["guarded"],
       "before":[
        {"file":"guarded/inner.txt","content":"inner\n"},
        {"file":"guarded/deep/note.txt","content":"note\n"},
        {"link":["guarded/inner.txt","loose.txt"]}
       ],
       "after":[
        {"link":["guarded/deep/note.txt","late.txt"]},
        {"write":"loose.txt"},
        {"write":"late.txt"},
        {"write":"guarded/inner.txt"}
       ]}
      """
    Then k-exec-protected-hardlink-alias: the pretool hook answers:
      """
      [
        {"path":"loose.txt","links":2,"decision":"deny","reason":"Kogen: this is a hard link to a protected path (guarded)"},
        {"path":"late.txt","links":2,"decision":"deny","reason":"Kogen: this is a hard link to a protected path (guarded)"},
        {"path":"guarded/inner.txt","links":2,"decision":"deny","reason":"Kogen: this is a protected path (guarded)"}
      ]
      """
    And k-exec-protected-hardlink-alias: the hook log holds, each with the run nonce:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","decision":"deny","path":"$ABS/r/loose.txt","reason":"this is a hard link to a protected path (guarded)"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","decision":"deny","path":"$ABS/r/late.txt","reason":"this is a hard link to a protected path (guarded)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","decision":"deny","path":"$ABS/r/guarded/inner.txt","reason":"this is a protected path (guarded)"}
      ]
      """
    And k-exec-protected-hardlink-alias: the files keep their contents:
      """
      {"guarded/inner.txt":"inner\n","guarded/deep/note.txt":"note\n"}
      """

  Scenario: The identity check runs only for targets with more than one link, against the set Start recorded, and the hook scans no directory
    When k-exec-protected-hardlink-alias: Start runs and then:
      """
      {"protected":["guarded"],
       "before":[
        {"file":"guarded/inner.txt","content":"inner\n"}
       ],
       "after":[
        {"rename":["guarded/inner.txt","moved.txt"]},
        {"write":"moved.txt"},
        {"link":["moved.txt","moved-link.txt"]},
        {"write":"moved.txt"},
        {"write":"moved-link.txt"},
        {"file":"guarded/fresh.txt","content":"fresh\n"},
        {"link":["guarded/fresh.txt","fresh-link.txt"]},
        {"write":"fresh-link.txt"},
        {"write":"guarded/fresh.txt"}
       ]}
      """
    Then k-exec-protected-hardlink-alias: the pretool hook answers:
      """
      [
        {"path":"moved.txt","links":1,"decision":"allow","reason":""},
        {"path":"moved.txt","links":2,"decision":"deny","reason":"Kogen: this is a hard link to a protected path (guarded)"},
        {"path":"moved-link.txt","links":2,"decision":"deny","reason":"Kogen: this is a hard link to a protected path (guarded)"},
        {"path":"fresh-link.txt","links":2,"decision":"allow","reason":""},
        {"path":"guarded/fresh.txt","links":2,"decision":"deny","reason":"Kogen: this is a protected path (guarded)"}
      ]
      """
    And k-exec-protected-hardlink-alias: the hook log holds, each with the run nonce:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","decision":"allow","path":"$ABS/r/moved.txt","reason":""},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","decision":"deny","path":"$ABS/r/moved.txt","reason":"this is a hard link to a protected path (guarded)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","decision":"deny","path":"$ABS/r/moved-link.txt","reason":"this is a hard link to a protected path (guarded)"},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","decision":"allow","path":"$ABS/r/fresh-link.txt","reason":""},
        {"hook":"pretool","tool_use_id":"w4","tool_name":"Write","decision":"deny","path":"$ABS/r/guarded/fresh.txt","reason":"this is a protected path (guarded)"}
      ]
      """

  Scenario: Checkout symlinks to a protected file that also has a hard link outside the checkout are denied
    When k-exec-protected-hardlink-alias: Start runs and then:
      """
      {"protected":["locked.txt"],
       "before":[
        {"file":"locked.txt","content":"locked\n"},
        {"link":["locked.txt","$ABS/outside/far.txt"]},
        {"link":["locked.txt","alias.txt"]},
        {"symlink":["locked.txt","via-locked.txt"]},
        {"symlink":["alias.txt","via-alias.txt"]},
        {"symlink":["$ABS/outside/far.txt","via-far.txt"]}
       ],
       "after":[
        {"write":"via-locked.txt"},
        {"write":"via-alias.txt"},
        {"write":"via-far.txt"},
        {"write":"$ABS/outside/far.txt"}
       ]}
      """
    Then k-exec-protected-hardlink-alias: the pretool hook answers:
      """
      [
        {"path":"via-locked.txt","links":3,"decision":"deny","reason":"Kogen: this is a protected path (locked.txt)"},
        {"path":"via-alias.txt","links":3,"decision":"deny","reason":"Kogen: this is a hard link to a protected path (locked.txt)"},
        {"path":"via-far.txt","links":3,"decision":"deny","reason":"Kogen: the path is outside the checkout"},
        {"path":"$ABS/outside/far.txt","links":3,"decision":"deny","reason":"Kogen: the path is outside the checkout"}
      ]
      """
    And k-exec-protected-hardlink-alias: the hook log holds, each with the run nonce:
      """
      [
        {"hook":"pretool","tool_use_id":"w0","tool_name":"Write","decision":"deny","path":"$ABS/r/locked.txt","reason":"this is a protected path (locked.txt)"},
        {"hook":"pretool","tool_use_id":"w1","tool_name":"Write","decision":"deny","path":"$ABS/r/alias.txt","reason":"this is a hard link to a protected path (locked.txt)"},
        {"hook":"pretool","tool_use_id":"w2","tool_name":"Write","decision":"deny","path":"$ABS/outside/far.txt","reason":"the path is outside the checkout"},
        {"hook":"pretool","tool_use_id":"w3","tool_name":"Write","decision":"deny","path":"$ABS/outside/far.txt","reason":"the path is outside the checkout"}
      ]
      """
    And k-exec-protected-hardlink-alias: the files keep their contents:
      """
      {"locked.txt":"locked\n"}
      """
