Feature: TestFinalPersistenceFailures forces its write failure portably

  Scenario: The test forces the write failure without a platform device and without a skip
    When k-exec-final-persistence-test-portable: I read the body of TestFinalPersistenceFailures
    Then k-exec-final-persistence-test-portable: the body does not contain "/dev/"
    And k-exec-final-persistence-test-portable: the body does not contain "Skip"
    And k-exec-final-persistence-test-portable: the body contains "Mkfifo"
    And k-exec-final-persistence-test-portable: the body contains '"stderr flush"'
    And k-exec-final-persistence-test-portable: the body contains '"stream marker"'
    And k-exec-final-persistence-test-portable: the body contains '"round-1.stderr"'
    And k-exec-final-persistence-test-portable: the body contains '"round-1.jsonl"'
    And k-exec-final-persistence-test-portable: the body contains "StreamPersistBytes = 1"
    And k-exec-final-persistence-test-portable: the body contains '"executor/failed"'
    And k-exec-final-persistence-test-portable: the body contains '"cannot persist "'
    And k-exec-final-persistence-test-portable: the body contains '" after 0 bytes"'
    And k-exec-final-persistence-test-portable: the body contains '"executor_round_failed"'
    And k-exec-final-persistence-test-portable: the body contains '"executor_round_ended"'
    And k-exec-final-persistence-test-portable: the body contains '"kept_bytes"'
    And k-exec-final-persistence-test-portable: the body contains '"artifact"'

  Scenario: Both subtests run and pass on this host
    When k-exec-final-persistence-test-portable: I run "go test -count=1 -v -run TestFinalPersistenceFailures ./executor/claudecode/" in the checkout
    Then k-exec-final-persistence-test-portable: the command exits 0
    And k-exec-final-persistence-test-portable: the output has a line starting with "--- PASS: TestFinalPersistenceFailures ("
    And k-exec-final-persistence-test-portable: the output has a line starting with "--- PASS: TestFinalPersistenceFailures/stderr_flush ("
    And k-exec-final-persistence-test-portable: the output has a line starting with "--- PASS: TestFinalPersistenceFailures/stream_marker ("
    And k-exec-final-persistence-test-portable: the output does not contain "--- SKIP"

  Scenario: The package's tests type-check for darwin-arm64
    When k-exec-final-persistence-test-portable: I run "GOOS=darwin GOARCH=arm64 go vet ./executor/claudecode/" in the checkout
    Then k-exec-final-persistence-test-portable: the command exits 0

  Scenario: The forced failure is deterministic under the race detector
    When k-exec-final-persistence-test-portable: I run "go test -race -count=3 -v -run TestFinalPersistenceFailures ./executor/claudecode/" in the checkout
    Then k-exec-final-persistence-test-portable: the command exits 0
    And k-exec-final-persistence-test-portable: the output has a line starting with "--- PASS: TestFinalPersistenceFailures/stderr_flush ("
    And k-exec-final-persistence-test-portable: the output has a line starting with "--- PASS: TestFinalPersistenceFailures/stream_marker ("
    And k-exec-final-persistence-test-portable: the output does not contain "--- SKIP"
