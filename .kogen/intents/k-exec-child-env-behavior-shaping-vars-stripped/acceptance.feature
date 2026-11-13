Feature: Claude Code behaviour variables are stripped from the child environment

  Scenario: childEnv drops behaviour variables and keeps proxy, certificate and locale variables
    When k-exec-child-env-behavior-shaping-vars-stripped: childEnv runs over a base holding every behaviour variable plus HTTPS_PROXY, NO_PROXY, SSL_CERT_FILE, LANG and PATH
    Then k-exec-child-env-behavior-shaping-vars-stripped: the child environment has none of the behaviour variables, keeps the five passthrough entries and has one CLAUDE_CONFIG_DIR, one HOME and the setEnv entries

  Scenario: A round never exposes parent behaviour variables to claude
    When k-exec-child-env-behavior-shaping-vars-stripped: a round runs while the parent holds MAX_THINKING_TOKENS=1 and BASH_DEFAULT_TIMEOUT_MS=1
    Then k-exec-child-env-behavior-shaping-vars-stripped: the fake claude saw neither variable

  Scenario Outline: <file> names every stripped behaviour variable
    Then k-exec-child-env-behavior-shaping-vars-stripped: "<file>" names every behaviour variable in backticks

    Examples:
      | file                      |
      | docs/configuration.md     |
      | docs/executor-contract.md |
