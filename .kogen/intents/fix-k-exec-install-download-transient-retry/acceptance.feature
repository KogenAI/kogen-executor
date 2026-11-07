Feature: The runtime download review finding does not reproduce on main
  The review of k-exec-install-download-transient-retry claimed that downloadBinary skips the
  client policy of a.get and that the err.(*sys.Error) assertion in install can panic. These
  scenarios install through ensureRuntime with a scripted http.DefaultClient transport, a 200 ms
  header bound and a 10 ms retry pause, and record that neither claim holds.

  Scenario Outline: A retryable binary download failure ends as a typed refusal, not a panic
    When fix-k-exec-install-download-transient-retry: I install the runtime through the "<mode>" scripted transport
    Then fix-k-exec-install-download-transient-retry: the installation yields '<result>'
    Examples:
      | mode            | result |
      | http-503        | {"kind":"executor/unavailable","panic":"","detail":"HTTP 503 Service Unavailable; 3 attempts","paths":["/2.1.318/manifest.json","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude"],"retryLines":2,"sameShape":true} |
      | http-429        | {"kind":"executor/unavailable","panic":"","detail":"HTTP 429 Too Many Requests; 3 attempts","paths":["/2.1.318/manifest.json","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude"],"retryLines":2,"sameShape":true} |
      | transport-error | {"kind":"executor/unavailable","panic":"","detail":"intent fixture: connection refused; 3 attempts","paths":["/2.1.318/manifest.json","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude"],"retryLines":2,"sameShape":true} |
      | body-error      | {"kind":"executor/unavailable","panic":"","detail":"intent fixture: connection reset by peer; 3 attempts","paths":["/2.1.318/manifest.json","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude"],"retryLines":2,"sameShape":true} |
      | silent-headers  | {"kind":"executor/unavailable","panic":"","detail":"the server did not answer; 3 attempts","paths":["/2.1.318/manifest.json","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude","/2.1.318/linux-x64/claude"],"retryLines":2,"sameShape":true} |

  Scenario: The binary request goes through the same client and policy as the manifest request
    When fix-k-exec-install-download-transient-retry: I install the runtime through the "redirect" scripted transport
    Then fix-k-exec-install-download-transient-retry: the installation yields '{"kind":"none","panic":"","detail":null,"paths":["/2.1.318/manifest.json","/moved/manifest.json","/2.1.318/linux-x64/claude","/moved/linux-x64/claude"],"retryLines":0,"sameShape":true}'
