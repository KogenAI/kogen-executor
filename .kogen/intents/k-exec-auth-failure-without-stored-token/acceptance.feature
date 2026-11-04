Feature: Classify sign-in failures on either credential route
  Scenario Outline: Server results retain the correct classification and remediation
    When k-exec-auth-failure-without-stored-token: run the round:
      """
      {"Token":<token>,"Assistant":"<assistant>","Text":"<text>","IsError":<error>,"Terminal":"<terminal>","NoResult":<missing>}
      """
    Then k-exec-auth-failure-without-stored-token: the outcome is:
      """
      {"reason":"<reason>","hint":"<hint>"}
      """
    Examples:
      | token | assistant             | text                                                                  | error | terminal       | missing | reason                            | hint  |
      | false | authentication_failed | Failed to authenticate. API Error: 401 OAuth access token is invalid.  | true  | api_error      | false   | executor/auth_refused             | login |
      | false |                       | Failed to authenticate. API Error: 401 OAuth access token is invalid.  | true  | api_error      | false   | executor/auth_refused             | login |
      | false | authentication_failed | done                                                                  | false | api_error      | false   | success                           | none  |
      | false | overloaded            | Unable to authenticate while provider is overloaded                    | true  | api_error      | false   | executor/provider_unavailable     | none  |
      | true  | authentication_failed | Failed to authenticate. API Error: 401 OAuth access token is invalid.  | true  | api_error      | false   | executor/auth_refused             | token |
      | true  |                       | Failed to authenticate. API Error: 401 OAuth access token is invalid.  | true  | api_error      | false   | executor/auth_refused             | token |
      | true  | authentication_failed | done                                                                  | false | api_error      | false   | success                           | none  |
      | true  | overloaded            | Unable to authenticate while provider is overloaded                    | true  | api_error      | false   | executor/provider_unavailable     | none  |
      | false | authentication_failed |                                                                       | true  | api_error      | false   | executor/auth_refused             | login |
      | true  | authentication_failed |                                                                       | true  | api_error      | false   | executor/auth_refused             | token |
      | false | rate_limit            |                                                                       | true  | api_error      | false   | executor/usage_limit              | none  |
      | true  | rate_limit            |                                                                       | true  | api_error      | false   | executor/usage_limit              | none  |
      | false |                       | Prompt is too long: usage limit                                       | true  | blocking_limit | false   | candidate/context_budget_exceeded | none  |
      | true  |                       | Prompt is too long: usage limit                                       | true  | blocking_limit | false   | candidate/context_budget_exceeded | none  |
      | false |                       | overloaded                                                            | true  | api_error      | false   | executor/provider_unavailable     | none  |
      | true  |                       | overloaded                                                            | true  | api_error      | false   | executor/provider_unavailable     | none  |
      | false | authentication_failed |                                                                       | false | api_error      | true    | executor/protocol                 | none  |
      | true  | authentication_failed |                                                                       | false | api_error      | true    | executor/protocol                 | none  |
      | false |                       | Failed to authenticate: rate limit                                    | true  | api_error      | false   | executor/auth_refused             | login |
      | true  |                       | Failed to authenticate: rate limit                                    | true  | api_error      | false   | executor/auth_refused             | token |
      | false | authentication_failed | Prompt is too long                                                    | true  | api_error      | false   | executor/auth_refused             | login |
      | true  | authentication_failed | Prompt is too long                                                    | true  | api_error      | false   | executor/auth_refused             | token |
