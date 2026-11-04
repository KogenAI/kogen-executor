Feature: an existing artifact directory with open permissions is accepted as private

  Scenario: an absent artifact directory is created owner-only without a tightened key
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"absent","mode":"","foreign":false,"chmod_fail":false}
      """
    Then k-exec-artifact-dir-private-mode: the checked directory mode is "0700"
    And k-exec-artifact-dir-private-mode: the hook files in the checked directory are mode "0600"
    And k-exec-artifact-dir-private-mode: the hook policy log is "$ABS/absent/hook-log.jsonl" and each settings policy argument is "$ABS/absent/hook-policy.json"
    And k-exec-artifact-dir-private-mode: the start event has exactly the keys:
      """
      ["auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-private-mode: the start event has no artifact_dir_mode_tightened key
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink

  Scenario: a directory created by Start ignores the owner and chmod seams
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"absent","mode":"","foreign":true,"chmod_fail":true}
      """
    Then k-exec-artifact-dir-private-mode: the checked directory mode is "0700"
    And k-exec-artifact-dir-private-mode: the hook files in the checked directory are mode "0600"
    And k-exec-artifact-dir-private-mode: the hook policy log is "$ABS/absent/hook-log.jsonl" and each settings policy argument is "$ABS/absent/hook-policy.json"
    And k-exec-artifact-dir-private-mode: the start event has exactly the keys:
      """
      ["auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-private-mode: the start event has no artifact_dir_mode_tightened key
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink

  Scenario Outline: an existing directory with group or world access is tightened
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"directory","mode":"<mode>","foreign":false,"chmod_fail":false}
      """
    Then k-exec-artifact-dir-private-mode: the checked directory mode is "0700"
    And k-exec-artifact-dir-private-mode: the start event has artifact_dir_mode_tightened true
    And k-exec-artifact-dir-private-mode: the start event has exactly the keys:
      """
      ["artifact_dir_mode_tightened","auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-private-mode: the hook files in the checked directory are mode "0600"
    And k-exec-artifact-dir-private-mode: the hook policy log is "$ABS/dir/hook-log.jsonl" and each settings policy argument is "$ABS/dir/hook-policy.json"
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink

    Examples:
      | mode |
      | 0755 |
      | 0750 |
      | 0707 |

  Scenario: an existing owner-only directory is unchanged
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"directory","mode":"0700","foreign":false,"chmod_fail":false}
      """
    Then k-exec-artifact-dir-private-mode: the checked directory mode is "0700"
    And k-exec-artifact-dir-private-mode: the start event has no artifact_dir_mode_tightened key
    And k-exec-artifact-dir-private-mode: the start event has exactly the keys:
      """
      ["auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-private-mode: the hook files in the checked directory are mode "0600"
    And k-exec-artifact-dir-private-mode: the hook policy log is "$ABS/dir/hook-log.jsonl" and each settings policy argument is "$ABS/dir/hook-policy.json"
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink

  Scenario: the chmod-fail seam does not fire on an owner-only directory
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"directory","mode":"0700","foreign":false,"chmod_fail":true}
      """
    Then k-exec-artifact-dir-private-mode: the checked directory mode is "0700"
    And k-exec-artifact-dir-private-mode: the start event has no artifact_dir_mode_tightened key
    And k-exec-artifact-dir-private-mode: the start event has exactly the keys:
      """
      ["auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-private-mode: the hook files in the checked directory are mode "0600"
    And k-exec-artifact-dir-private-mode: the hook policy log is "$ABS/dir/hook-log.jsonl" and each settings policy argument is "$ABS/dir/hook-policy.json"
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink

  Scenario Outline: a directory the owner seam reports as foreign is refused
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"directory","mode":"<mode>","foreign":true,"chmod_fail":false}
      """
    Then k-exec-artifact-dir-private-mode: Start fails unavailable with detail "cannot secure the executor artifact directory $ABS/dir: not owned by this user" and writes no hook files
    And k-exec-artifact-dir-private-mode: the checked directory mode is "<mode>"
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink

    Examples:
      | mode |
      | 0755 |
      | 0700 |

  Scenario: a chmod failure leaves the open directory unchanged and writes no hook files
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"directory","mode":"0755","foreign":false,"chmod_fail":true}
      """
    Then k-exec-artifact-dir-private-mode: Start fails unavailable with detail "cannot secure the executor artifact directory $ABS/dir: cannot change its mode: operation not permitted" and writes no hook files
    And k-exec-artifact-dir-private-mode: the checked directory mode is "0755"
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink

  Scenario: the owner seam is decided before the chmod-fail seam
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"directory","mode":"0755","foreign":true,"chmod_fail":true}
      """
    Then k-exec-artifact-dir-private-mode: Start fails unavailable with detail "cannot secure the executor artifact directory $ABS/dir: not owned by this user" and writes no hook files
    And k-exec-artifact-dir-private-mode: the checked directory mode is "0755"
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink

  Scenario: a symlink to a world-accessible directory is tightened and used
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"symlink","mode":"0777","foreign":false,"chmod_fail":false}
      """
    Then k-exec-artifact-dir-private-mode: the checked directory mode is "0700"
    And k-exec-artifact-dir-private-mode: the start event has artifact_dir_mode_tightened true
    And k-exec-artifact-dir-private-mode: the start event has exactly the keys:
      """
      ["artifact_dir_mode_tightened","auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-private-mode: the hook files in the checked directory are mode "0600"
    And k-exec-artifact-dir-private-mode: the hook policy log is "$ABS/target/hook-log.jsonl" and each settings policy argument is "$ABS/target/hook-policy.json"
    And k-exec-artifact-dir-private-mode: the artifact path remains a symlink

  Scenario: a symlink to a directory the owner seam reports as foreign is refused by the resolved path
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"symlink","mode":"0755","foreign":true,"chmod_fail":false}
      """
    Then k-exec-artifact-dir-private-mode: Start fails unavailable with detail "cannot secure the executor artifact directory $ABS/target: not owned by this user" and writes no hook files
    And k-exec-artifact-dir-private-mode: the checked directory mode is "0755"
    And k-exec-artifact-dir-private-mode: the artifact path remains a symlink

  Scenario: a two-hop symlink is resolved once and the ultimate directory is untouched
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"hop","mode":"0777","foreign":false,"chmod_fail":false}
      """
    Then k-exec-artifact-dir-private-mode: Start fails unavailable with detail "cannot secure the executor artifact directory $ABS/mid: not a directory" and writes no hook files
    And k-exec-artifact-dir-private-mode: the artifact path remains a symlink
    And k-exec-artifact-dir-private-mode: the once-resolved path remains a symlink
    And k-exec-artifact-dir-private-mode: the ultimate directory mode is "0777" and it has no hook files

  Scenario: an owner-only directory reached through a parent symlink keeps that spelling
    When k-exec-artifact-dir-private-mode: Start runs with:
      """
      {"setup":"parent","mode":"0700","foreign":false,"chmod_fail":false}
      """
    Then k-exec-artifact-dir-private-mode: the checked directory mode is "0700"
    And k-exec-artifact-dir-private-mode: the start event has no artifact_dir_mode_tightened key
    And k-exec-artifact-dir-private-mode: the start event has exactly the keys:
      """
      ["auth","claude_code_version","contract","effort","event","executor","max_turns","model","role","run_id","session_id","setting_sources","version"]
      """
    And k-exec-artifact-dir-private-mode: the hook files in the checked directory are mode "0600"
    And k-exec-artifact-dir-private-mode: the hook policy log is "$ABS/parent-link/exec/hook-log.jsonl" and each settings policy argument is "$ABS/parent-link/exec/hook-policy.json"
    And k-exec-artifact-dir-private-mode: the artifact path is not a symlink
