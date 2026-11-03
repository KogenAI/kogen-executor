Feature: Bound stalled runtime downloads without limiting progress
  Scenario Outline: Runtime installation and lock lifecycle with internal idle injection
    When k-exec-install-download-stall: I install against the "<mode>" local origin using the internal idle seam
    Then k-exec-install-download-stall: the "<mode>" result is "<reason>" within 3000 milliseconds with <notices> waiting notices
    And k-exec-install-download-stall: the named default "downloadIdleTimeout" is 30 seconds
    Examples:
      | mode     | reason      | notices |
      | stall    | unavailable | 0       |
      | slow     | none        | 0       |
      | handoff  | unavailable | 1       |
      | cancel   | interrupted | 0       |
      | deadline | deadline    | 0       |
