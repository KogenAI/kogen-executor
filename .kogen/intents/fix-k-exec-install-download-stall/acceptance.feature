Feature: Count only incomplete runtime downloads as stalled
  Scenario Outline: Install the pinned runtime through a scripted transport with 200 ms idle and header bounds
    When fix-k-exec-install-download-stall: I install the runtime through the "<mode>" scripted transport
    Then fix-k-exec-install-download-stall: the installation yields '<result>'
    Examples:
      | mode                    | result |
      | late-eof                | {"outcome":"installed","binaryRequests":1,"manifestRequests":1,"endAfterCancel":true,"retryLines":0,"stalled":false,"minElapsedMs":150,"maxElapsedMs":3000} |
      | short-eof               | {"outcome":"unavailable","binaryRequests":1,"manifestRequests":1,"endAfterCancel":true,"retryLines":0,"names":"binary","stalled":true,"short":false,"minElapsedMs":150,"maxElapsedMs":3000} |
      | late-error              | {"outcome":"unavailable","binaryRequests":1,"manifestRequests":1,"endAfterCancel":true,"retryLines":0,"names":"binary","stalled":true,"short":false,"minElapsedMs":150,"maxElapsedMs":3000} |
      | prompt-eof              | {"outcome":"installed","binaryRequests":1,"manifestRequests":1,"endAfterCancel":false,"retryLines":0,"stalled":false,"maxElapsedMs":3000} |
      | short-prompt            | {"outcome":"unavailable","binaryRequests":1,"manifestRequests":1,"endAfterCancel":false,"retryLines":0,"stalled":false,"short":true,"maxElapsedMs":3000} |
      | silent-headers          | {"outcome":"unavailable","binaryRequests":3,"manifestRequests":1,"endAfterCancel":false,"retryLines":2,"names":"binary","noAnswer":true,"attempts3":true,"stalled":false,"hung":3,"hungWithinBound":true,"maxElapsedMs":3000} |
      | manifest-silent-headers | {"outcome":"unavailable","binaryRequests":0,"manifestRequests":1,"endAfterCancel":false,"retryLines":0,"names":"manifest","noAnswer":true,"attempts3":false,"stalled":false,"hung":1,"hungWithinBound":true,"maxElapsedMs":3000} |
