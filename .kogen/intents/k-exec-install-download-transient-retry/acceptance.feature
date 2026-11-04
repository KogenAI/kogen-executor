Feature: Retry only transient pinned runtime downloads
  Scenario Outline: Install from a local synthetic origin
    Then k-exec-install-download-transient-retry: installing with "<origin>" yields '<result>'
    Examples:
      | origin | result |
      | 503-once | {"requests":2,"success":true,"matches":true,"retries":1,"retryLinesValid":true,"partialCount":0,"lockReleased":true,"lockHeld":true,"pausesChecked":1} |
      | disconnect | {"requests":2,"success":true,"matches":true,"retries":1,"retryLinesValid":true,"partialCount":0,"lockReleased":true,"lockHeld":true,"pausesChecked":1} |
      | 503 | {"requests":3,"success":false,"retries":2,"retryLinesValid":true,"source":true,"http503":true,"attempts3":true,"partialCount":0,"lockReleased":true,"lockHeld":true,"pausesChecked":2} |
      | 404 | {"requests":1,"success":false,"retries":0,"partialCount":0,"lockReleased":true} |
      | checksum | {"requests":1,"success":false,"retries":0,"mismatch":true,"partialCount":0,"lockReleased":true} |
      | cancel | {"requests":1,"success":false,"retries":1,"interrupt":true,"prompt":true,"partialCount":0,"lockReleased":true,"lockHeld":true,"pausesChecked":1} |
      | 429-once | {"requests":2,"success":true,"matches":true,"retries":1,"partialCount":0,"lockReleased":true} |
      | connect | {"requests":2,"success":true,"matches":true,"retries":1,"partialCount":0,"lockReleased":true} |
      | 403 | {"requests":1,"success":false,"retries":0,"partialCount":0,"lockReleased":true} |
      | size | {"requests":1,"success":false,"retries":0,"mismatch":true,"partialCount":0,"lockReleased":true} |
      | stall | {"requests":1,"success":false,"retries":0,"partialCount":0,"lockReleased":true} |
