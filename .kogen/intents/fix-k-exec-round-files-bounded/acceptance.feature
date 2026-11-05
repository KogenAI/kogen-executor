Feature: Stderr persistence counts bytes a failed or short write did not persist
  A fake Claude Code child writes the given number of stderr bytes and then finishes its round.
  Sink "full" links the round's stderr artifact to /dev/full, so every write to it fails.
  Sink "fsize" lowers the executor process's RLIMIT_FSIZE to Limit, so the artifact takes only
  its first Limit bytes. stderr_size is the size of round-1.stderr on disk, or -1 when that
  path is not a regular file. The terminal event must hold every listed field with that exact value.

  Scenario: An artifact that refuses every write counts every stderr byte as unpersisted
    When fix-k-exec-round-files-bounded: a round runs with:
      """
      {"Stderr":1048576,"Sink":"full"}
      """
    Then fix-k-exec-round-files-bounded: the round outcome is:
      """
      {"within_ms":10000,"error":"executor/failed: cannot persist round-1.stderr after 0 bytes","stderr_size":-1,"terminal":{"event":"executor_round_failed","reason":"failed","detail":"cannot persist round-1.stderr after 0 bytes","artifact":"round-1.stderr","kept_bytes":0,"stderr_persist_truncated":true,"stderr_persist_unpersisted_bytes":1048576}}
      """

  Scenario: An artifact that takes only part of a write counts the unwritten remainder
    When fix-k-exec-round-files-bounded: a round runs with:
      """
      {"Stderr":1048576,"Sink":"fsize","Limit":4096}
      """
    Then fix-k-exec-round-files-bounded: the round outcome is:
      """
      {"within_ms":10000,"error":"executor/failed: cannot persist round-1.stderr after 4096 bytes","stderr_size":4096,"terminal":{"event":"executor_round_failed","reason":"failed","detail":"cannot persist round-1.stderr after 4096 bytes","artifact":"round-1.stderr","kept_bytes":4096,"stderr_persist_truncated":true,"stderr_persist_unpersisted_bytes":1044480}}
      """
