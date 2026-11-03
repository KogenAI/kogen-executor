Feature: Profile each Claude Code round's event stream in its terminal record
  executor_round_ended and executor_round_failed carry wall_ms, init_ms (only when the init
  event passed the gate), max_line_gap_ms and ignored_events (only when a line was ignored).
  Rounds run through the real adapter against a fake claude script with real sleeps.

  Background:
    Given the stream-profile round "gaps" streams:
      """json
      ["init", 1, {"type":"assistant","message":{"content":[]}}, 5, {"type":"assistant","message":{"content":[]}}, 1,
       {"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@","num_turns":1,"terminal_reason":"completed"}]
      """
    And the stream-profile round "late init" streams:
      """json
      [2, "init", {"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@","num_turns":1,"terminal_reason":"completed"}]
      """
    And the stream-profile round "notices" streams:
      """json
      ["init", {"type":"system","subtype":"other_notice"}, {"type":"system","subtype":"hook_started","hook_event":"PreToolUse"},
       {"type":"progress_tick"}, {"type":"system","subtype":"other_notice"},
       {"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@","num_turns":1,"terminal_reason":"completed"}]
      """
    And the stream-profile round "plain" streams:
      """json
      ["init", {"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@","num_turns":1,"terminal_reason":"completed"}]
      """
    And the stream-profile round "forty" streams init, 40 system lines with subtypes notice_01 upward, and a success result
    And the stream-profile round "long keys" streams:
      """json
      ["init", {"type":"system","subtype":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, {"type":"system","subtype":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab"},
       {"type":"system","subtype":"éééééééééééééééééééééééééééééééééééééééééééééééééééééééééééé"},
       {"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"@SID@","num_turns":1,"terminal_reason":"completed"}]
      """
    And the stream-profile round "no init" streams:
      """json
      [{"type":"system","subtype":"hook_started","hook_event":"SessionStart"}, 2, {"type":"system","subtype":"hook_response","hook_event":"SessionStart"}]
      """
    And the stream-profile round "dies after init" streams these items and exits with status 3:
      """json
      ["init", {"type":"system","subtype":"other_notice"}, 1, {"type":"assistant","message":{"content":[]}}]
      """
    When the stream-profile rounds run

  Scenario: Lines at 0 s, 1 s, 6 s and 7 s report a 5 s longest gap and at least 7 s of wall time
    Then the stream-profile round "gaps" emits "executor_round_ended" with ending "finish" and reason ""
    And the stream-profile round "gaps" reports "max_line_gap_ms" from 4900 to 6000
    And the stream-profile round "gaps" reports "wall_ms" from 7000 to 30000
    And the stream-profile round "gaps" reports "init_ms" from 0 to 3000
    And the stream-profile round "gaps" does not report "ignored_events"

  Scenario: Time to init is measured from process start and the wait before the first line is not a line gap
    Then the stream-profile round "late init" emits "executor_round_ended" with ending "finish" and reason ""
    And the stream-profile round "late init" reports "init_ms" from 1900 to 6000
    And the stream-profile round "late init" reports "max_line_gap_ms" from 0 to 900
    And the stream-profile round "late init" reports "wall_ms" from 2000 to 30000

  Scenario: Uninterpreted lines are counted by type/subtype without changing the round outcome
    Then the stream-profile round "notices" emits "executor_round_ended" with ending "finish" and reason ""
    And the stream-profile round "notices" reports ignored events:
      """json
      {"system/other_notice":2,"progress_tick":1}
      """
    And the stream-profile round "plain" does not report "ignored_events"
    And the stream-profile rounds "notices" and "plain" have the same outcome

  Scenario: Forty distinct unknown subtypes keep only the first 16 keys and the round still finishes
    Then the stream-profile round "forty" emits "executor_round_ended" with ending "finish" and reason ""
    And the stream-profile round "forty" reports ignored events:
      """json
      {"system/notice_01":1,"system/notice_02":1,"system/notice_03":1,"system/notice_04":1,
       "system/notice_05":1,"system/notice_06":1,"system/notice_07":1,"system/notice_08":1,
       "system/notice_09":1,"system/notice_10":1,"system/notice_11":1,"system/notice_12":1,
       "system/notice_13":1,"system/notice_14":1,"system/notice_15":1,"system/notice_16":1}
      """

  Scenario: Long keys are cut to 64 bytes on a UTF-8 boundary and lines sharing the cut key share a count
    Then the stream-profile round "long keys" emits "executor_round_ended" with ending "finish" and reason ""
    And the stream-profile round "long keys" reports ignored events:
      """json
      {"system/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":2,"system/éééééééééééééééééééééééééééé":1}
      """

  Scenario: A stream with no init fails with wall time and line gap but no init time
    Then the stream-profile round "no init" emits "executor_round_failed" with ending "" and reason "protocol"
    And the stream-profile round "no init" reports "wall_ms" from 2000 to 30000
    And the stream-profile round "no init" reports "max_line_gap_ms" from 1900 to 4000
    And the stream-profile round "no init" does not report "init_ms"
    And the stream-profile round "no init" does not report "ignored_events"

  Scenario: A round that fails after init carries the whole profile in its failed event
    Then the stream-profile round "dies after init" emits "executor_round_failed" with ending "" and reason "failed"
    And the stream-profile round "dies after init" reports "init_ms" from 0 to 3000
    And the stream-profile round "dies after init" reports "max_line_gap_ms" from 900 to 3000
    And the stream-profile round "dies after init" reports "wall_ms" from 1000 to 30000
    And the stream-profile round "dies after init" reports ignored events:
      """json
      {"system/other_notice":1}
      """
