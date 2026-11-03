Feature: Distinguish transient Claude Code provider failures
  Scenario Outline: Classify results without losing other reasons
    When the overload adapter receives:
      """
      {"Assistant":"<assistant>","Text":"<text>","Error":<error>,"Auth":<auth>,"Malformed":<malformed>}
      """
    Then the overload outcome is:
      """
      {"class":"<class>","reason":"<reason>","word":"<word>"}
      """
    Examples:
      | assistant             | text                                         | error | auth  | malformed | class     | reason                  | word             |
      | overloaded            |                                              | true  | false | false     | executor  | provider_unavailable    | overloaded       |
      |                       | API Error: 529 overloaded_error               | true  | false | false     | executor  | provider_unavailable    | 529              |
      |                       | API Error: 503 Service Unavailable            | true  | false | false     | executor  | provider_unavailable    | 503              |
      |                       | API Error: 500 Internal Server Error          | true  | false | false     | executor  | provider_unavailable    | 500              |
      |                       | API Error: 599 Service Unavailable            | true  | false | false     | executor  | provider_unavailable    | 599              |
      |                       | overloaded_error: temporarily unavailable     | true  | false | false     | executor  | provider_unavailable    | overloaded_error |
      |                       | overloaded                                   | true  | false | false     | executor  | provider_unavailable    | overloaded       |
      | rate_limit            | quota exceeded                               | true  | false | false     | executor  | usage_limit             |                  |
      | authentication_failed | Failed to authenticate: overloaded           | true  | true  | false     | executor  | auth_refused            |                  |
      | authentication_failed | Failed to authenticate: overloaded           | true  | false | false     | executor  | failed                  |                  |
      |                       | Prompt is too long                           | true  | false | false     | candidate | context_budget_exceeded |                  |
      |                       | generic api_error                            | true  | false | false     | executor  | failed                  |                  |
      |                       | API Error: 499                                | true  | false | false     | executor  | failed                  |                  |
      |                       | API Error: 600                                | true  | false | false     | executor  | failed                  |                  |
      | overloaded            | API Error: 529 overloaded_error               | true  | false | true      | executor  | protocol                |                  |
      |                       | The service used the word overloaded         | false | false | false     |           |                         |                  |
