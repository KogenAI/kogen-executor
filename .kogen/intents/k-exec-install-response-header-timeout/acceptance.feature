Feature: Bound the wait for runtime download response headers
  Scenario Outline: Install the pinned runtime from a local synthetic origin with the header bound shortened through its seam
    Then k-exec-install-response-header-timeout: installing against the "<origin>" origin yields '<result>'
    And k-exec-install-response-header-timeout: the named default "downloadHeaderTimeout" is 30 seconds
    Examples:
      | origin          | result |
      | silent          | {"outcome":"unavailable","binaryRequests":3,"manifestRequests":1,"retryLines":2,"retryNoAnswer":true,"names":"binary","noAnswer":true,"attempts3":true,"hung":3,"hungWithinBound":true,"maxElapsedMs":3000} |
      | partial-headers | {"outcome":"unavailable","binaryRequests":3,"manifestRequests":1,"retryLines":2,"retryNoAnswer":true,"names":"binary","noAnswer":true,"attempts3":true,"hung":3,"hungWithinBound":true,"maxElapsedMs":3000} |
      | silent-once     | {"outcome":"installed","binaryRequests":2,"manifestRequests":1,"retryLines":1,"retryNoAnswer":true,"hung":1,"hungWithinBound":true,"maxElapsedMs":3000} |
      | slow-body       | {"outcome":"installed","binaryRequests":1,"manifestRequests":1,"retryLines":0,"hung":0,"minElapsedMs":1000,"maxElapsedMs":5000} |
      | manifest-silent | {"outcome":"unavailable","binaryRequests":0,"manifestRequests":1,"retryLines":0,"names":"manifest","noAnswer":true,"attempts3":false,"hung":1,"hungWithinBound":true,"maxElapsedMs":3000} |
      | 503             | {"outcome":"unavailable","binaryRequests":3,"manifestRequests":1,"retryLines":2,"retryNoAnswer":false,"names":"binary","noAnswer":false,"http":"HTTP 503","attempts3":true,"hung":0,"maxElapsedMs":3000} |
      | 404             | {"outcome":"unavailable","binaryRequests":1,"manifestRequests":1,"retryLines":0,"names":"binary","noAnswer":false,"http":"HTTP 404","attempts3":false,"hung":0,"maxElapsedMs":2000} |
      | deadline        | {"outcome":"deadline","binaryRequests":1,"manifestRequests":1,"retryLines":0,"noAnswer":false,"hung":1,"maxElapsedMs":2000} |
