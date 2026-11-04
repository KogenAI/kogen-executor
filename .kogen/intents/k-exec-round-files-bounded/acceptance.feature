Feature: Bound each round's persisted artifacts without limiting execution

  Scenario: Keep parsing 100 valid stream lines after 4 KiB persistence stops
    When k-exec-round-files-bounded: a fake round runs with:
      """
      {"Lines":100,"Stderr":0,"StreamCap":4096,"StderrCap":4096}
      """
    Then k-exec-round-files-bounded: persistence is bounded without changing enforcement

  Scenario: Drain a MiB of stderr and finish successfully
    When k-exec-round-files-bounded: a fake round runs with:
      """
      {"Lines":0,"Stderr":1048576,"StreamCap":4096,"StderrCap":4096}
      """
    Then k-exec-round-files-bounded: persistence is bounded without changing enforcement

  Scenario: Keep both complete files below the cap with absent telemetry
    When k-exec-round-files-bounded: a fake round runs with:
      """
      {"Lines":2,"Stderr":20,"StreamCap":4096,"StderrCap":4096}
      """
    Then k-exec-round-files-bounded: persistence is bounded without changing enforcement

  Scenario: Include the truncation marker in the nonzero no-result error
    When k-exec-round-files-bounded: a fake round runs with:
      """
      {"Lines":100,"Stderr":1048576,"Fail":true,"StreamCap":4096,"StderrCap":4096}
      """
    Then k-exec-round-files-bounded: persistence is bounded without changing enforcement

  Scenario: Redact stored tokens before and beyond both persistence cutoffs
    When k-exec-round-files-bounded: a fake round runs with:
      """
      {"Lines":100,"Stderr":1048576,"Secret":true,"StreamCap":4096,"StderrCap":4096}
      """
    Then k-exec-round-files-bounded: persistence is bounded without changing enforcement

  Scenario: Reject malformed stream content even after persistence stops
    When k-exec-round-files-bounded: a fake round runs with:
      """
      {"Lines":100,"Stderr":0,"Invalid":true,"StreamCap":4096,"StderrCap":4096}
      """
    Then k-exec-round-files-bounded: persistence is bounded without changing enforcement

  Scenario: Redact a split-write stored token while under the caps
    When k-exec-round-files-bounded: a fake round runs with:
      """
      {"Lines":2,"Stderr":20,"Secret":true,"StreamCap":4096,"StderrCap":4096}
      """
    Then k-exec-round-files-bounded: persistence is bounded without changing enforcement

  Scenario Outline: Count only bytes actually beyond the stderr boundary
    When k-exec-round-files-bounded: a fake round runs with:
      """
      {"Lines":0,"Stderr":<bytes>,"StreamCap":4096,"StderrCap":4096}
      """
    Then k-exec-round-files-bounded: persistence is bounded without changing enforcement
    Examples:
      | bytes |
      | 4095  |
      | 4096  |
      | 4097  |
