Feature: Prune Claude Code transcripts that no round can resume

  Every Start of the Claude Code adapter removes session transcripts in Kogen's Claude Code
  configuration folder (config/projects/<working-directory folder>/<session id>.jsonl) that
  have not been modified for the retention period, and reports what it did in the start event.

  Scenario: The default retention removes transcripts older than 24 hours and leaves other configuration alone
    Given claude-transcripts-grow-without-bound: a fake Kogen Claude Code home with:
      | path                                                                        | kind | hours | bytes | target |
      | config/projects/-home-dev-alpha/11111111-1111-4111-8111-111111111111.jsonl | file | 2     | 100   |        |
      | config/projects/-home-dev-alpha/22222222-2222-4222-8222-222222222222.jsonl | file | 30    | 300   |        |
      | config/projects/-home-dev-beta/33333333-3333-4333-8333-333333333333.jsonl  | file | 90    | 4000  |        |
      | config/projects/-home-dev-beta/notes.jsonl                                  | file | 90    | 50    |        |
      | config/settings.json                                                        | file | 90    | 20    |        |
      | config/policy-limits.json                                                   | file | 90    | 30    |        |
      | config/plugins                                                              | dir  | 90    |       |        |
      | config/plugins/44444444-4444-4444-8444-444444444444.jsonl                   | file | 90    | 70    |        |
    When claude-transcripts-grow-without-bound: Start runs with the default retention
    Then claude-transcripts-grow-without-bound: Start succeeds
    And claude-transcripts-grow-without-bound: the start event reports transcripts:
      """
      {"removed": 2, "removed_bytes": 4300, "kept": 1, "remove_failed": 0, "bound_reached": false}
      """
    And claude-transcripts-grow-without-bound: these paths are gone:
      """
      ["config/projects/-home-dev-alpha/22222222-2222-4222-8222-222222222222.jsonl",
       "config/projects/-home-dev-beta/33333333-3333-4333-8333-333333333333.jsonl"]
      """
    And claude-transcripts-grow-without-bound: these paths remain unchanged:
      """
      ["config/projects/-home-dev-alpha/11111111-1111-4111-8111-111111111111.jsonl",
       "config/projects/-home-dev-beta/notes.jsonl",
       "config/settings.json",
       "config/policy-limits.json",
       "config/plugins",
       "config/plugins/44444444-4444-4444-8444-444444444444.jsonl"]
      """

  Scenario: The retention option sets the period
    Given claude-transcripts-grow-without-bound: a fake Kogen Claude Code home with:
      | path                                                                        | kind | hours | bytes | target |
      | config/projects/-home-dev-alpha/11111111-1111-4111-8111-111111111111.jsonl | file | 2     | 100   |        |
      | config/projects/-home-dev-alpha/22222222-2222-4222-8222-222222222222.jsonl | file | 30    | 300   |        |
      | config/projects/-home-dev-beta/33333333-3333-4333-8333-333333333333.jsonl  | file | 90    | 4000  |        |
    When claude-transcripts-grow-without-bound: Start runs with the retention option set to 48 hours
    Then claude-transcripts-grow-without-bound: Start succeeds
    And claude-transcripts-grow-without-bound: the start event reports transcripts:
      """
      {"removed": 1, "removed_bytes": 4000, "kept": 2, "remove_failed": 0, "bound_reached": false}
      """
    And claude-transcripts-grow-without-bound: these paths are gone:
      """
      ["config/projects/-home-dev-beta/33333333-3333-4333-8333-333333333333.jsonl"]
      """
    And claude-transcripts-grow-without-bound: these paths remain unchanged:
      """
      ["config/projects/-home-dev-alpha/11111111-1111-4111-8111-111111111111.jsonl",
       "config/projects/-home-dev-alpha/22222222-2222-4222-8222-222222222222.jsonl"]
      """

  Scenario: Retention option 0 keeps everything
    Given claude-transcripts-grow-without-bound: a fake Kogen Claude Code home with:
      | path                                                                        | kind | hours | bytes | target |
      | config/projects/-home-dev-alpha/11111111-1111-4111-8111-111111111111.jsonl | file | 2     | 100   |        |
      | config/projects/-home-dev-alpha/22222222-2222-4222-8222-222222222222.jsonl | file | 30    | 300   |        |
      | config/projects/-home-dev-beta/33333333-3333-4333-8333-333333333333.jsonl  | file | 90    | 4000  |        |
      | config/settings.json                                                        | file | 90    | 20    |        |
      | config/plugins                                                              | dir  | 90    |       |        |
    When claude-transcripts-grow-without-bound: Start runs with the retention option set to 0 hours
    Then claude-transcripts-grow-without-bound: Start succeeds
    And claude-transcripts-grow-without-bound: the start event has no transcripts report
    And claude-transcripts-grow-without-bound: these paths remain unchanged:
      """
      ["config/projects/-home-dev-alpha/11111111-1111-4111-8111-111111111111.jsonl",
       "config/projects/-home-dev-alpha/22222222-2222-4222-8222-222222222222.jsonl",
       "config/projects/-home-dev-beta/33333333-3333-4333-8333-333333333333.jsonl",
       "config/settings.json",
       "config/plugins"]
      """

  Scenario: Symlinks in the transcript area are neither followed nor removed
    Given claude-transcripts-grow-without-bound: a fake Kogen Claude Code home with:
      | path                                                                        | kind | hours | bytes | target               |
      | outside/target.jsonl                                                        | file | 90    | 64    |                      |
      | config/projects/-home-dev-alpha/55555555-5555-4555-8555-555555555555.jsonl | link | 90    |       | outside/target.jsonl |
      | outside/workdir                                                             | dir  | 90    |       |                      |
      | outside/workdir/66666666-6666-4666-8666-666666666666.jsonl                  | file | 90    | 80    |                      |
      | config/projects/-home-dev-linked                                            | link | 90    |       | outside/workdir      |
      | config/projects/-home-dev-beta/77777777-7777-4777-8777-777777777777.jsonl  | file | 90    | 500   |                      |
    When claude-transcripts-grow-without-bound: Start runs with the default retention
    Then claude-transcripts-grow-without-bound: Start succeeds
    And claude-transcripts-grow-without-bound: the start event reports transcripts:
      """
      {"removed": 1, "removed_bytes": 500, "kept": 0, "remove_failed": 0, "bound_reached": false}
      """
    And claude-transcripts-grow-without-bound: these paths are gone:
      """
      ["config/projects/-home-dev-beta/77777777-7777-4777-8777-777777777777.jsonl"]
      """
    And claude-transcripts-grow-without-bound: these paths remain unchanged:
      """
      ["outside/target.jsonl",
       "config/projects/-home-dev-alpha/55555555-5555-4555-8555-555555555555.jsonl",
       "outside/workdir",
       "outside/workdir/66666666-6666-4666-8666-666666666666.jsonl",
       "config/projects/-home-dev-linked"]
      """

  Scenario: A failed removal is counted and Start still succeeds
    Given claude-transcripts-grow-without-bound: a fake Kogen Claude Code home with:
      | path                                                                         | kind   | hours | bytes | target |
      | config/projects/-home-dev-locked                                             | locked | 1     |       |        |
      | config/projects/-home-dev-locked/99999999-9999-4999-8999-999999999999.jsonl | file   | 90    | 120   |        |
      | config/projects/-home-dev-beta/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jsonl   | file   | 90    | 200   |        |
    When claude-transcripts-grow-without-bound: Start runs with the default retention
    Then claude-transcripts-grow-without-bound: Start succeeds
    And claude-transcripts-grow-without-bound: the start event reports transcripts:
      """
      {"removed": 1, "removed_bytes": 200, "kept": 0, "remove_failed": 1, "bound_reached": false}
      """
    And claude-transcripts-grow-without-bound: these paths are gone:
      """
      ["config/projects/-home-dev-beta/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jsonl"]
      """
    And claude-transcripts-grow-without-bound: these paths remain unchanged:
      """
      ["config/projects/-home-dev-locked",
       "config/projects/-home-dev-locked/99999999-9999-4999-8999-999999999999.jsonl"]
      """

  Scenario: More entries than the examination bound stop the examination at 10000 entries
    Given claude-transcripts-grow-without-bound: the configuration folder "config/projects/-home-dev-bulk" holds 10050 session transcripts of 10 bytes aged 30 hours
    When claude-transcripts-grow-without-bound: Start runs with the default retention
    Then claude-transcripts-grow-without-bound: Start succeeds
    And claude-transcripts-grow-without-bound: Start returned within 15000 milliseconds
    And claude-transcripts-grow-without-bound: the start event reports transcripts:
      """
      {"removed": 9999, "removed_bytes": 99990, "kept": 0, "remove_failed": 0, "bound_reached": true}
      """
    And claude-transcripts-grow-without-bound: the folder "config/projects/-home-dev-bulk" holds 51 entries

  Scenario: The new session's own transcript is never removed, even when it is old
    Given claude-transcripts-grow-without-bound: a fake Kogen Claude Code home with:
      | path                                                                        | kind | hours | bytes | target |
      | config/projects/-home-dev-alpha/00000000-0000-4000-8000-000000000000.jsonl | file | 90    | 150   |        |
      | config/projects/-home-dev-alpha/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jsonl | file | 90    | 250   |        |
    When claude-transcripts-grow-without-bound: Start runs with the default retention and all-zero session randomness
    Then claude-transcripts-grow-without-bound: the start event session id is "00000000-0000-4000-8000-000000000000"
    And claude-transcripts-grow-without-bound: the start event reports transcripts:
      """
      {"removed": 1, "removed_bytes": 250, "kept": 0, "remove_failed": 0, "bound_reached": false}
      """
    And claude-transcripts-grow-without-bound: these paths are gone:
      """
      ["config/projects/-home-dev-alpha/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jsonl"]
      """
    And claude-transcripts-grow-without-bound: these paths remain unchanged:
      """
      ["config/projects/-home-dev-alpha/00000000-0000-4000-8000-000000000000.jsonl"]
      """
