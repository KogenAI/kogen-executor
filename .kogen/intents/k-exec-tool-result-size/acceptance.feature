Feature: Executor tool result telemetry
  Scenario Outline: Count received results without logging their content
    When k-exec-tool-result-size: a synthetic round completes:
      """
      <fixture>
      """
    Then k-exec-tool-result-size: its tool event is:
      """
      {"event":{"event":"executor_tool","round":1,"name":"<name>","tool_use_id":"t1","denied":<denied>,"arguments":{"file_path":"app.txt"},"result_bytes":<bytes>,"result_error":<error>,"result_items":<items><extra>},"forbidden":<forbidden>}
      """
    Examples:
      | fixture | name | denied | bytes | error | items | extra | forbidden |
      | {"role":"build","name":"Read","repeat":{"text":"x","times":12000},"error":false} | Read | false | 12000 | false | 1 | | ["xxxxxxxxxxxxxxxx"] |
      | {"role":"build","name":"Read","content":"boom","error":true} | Read | false | 4 | true | 1 | | ["boom"] |
      | {"role":"build","name":"Read","content":[{"type":"image","source":{"type":"base64","media_type":"image/png","data":"image-payload-only"}}],"error":false} | Read | false | 0 | false | 1 | | ["image-payload-only"] |
      | {"role":"build","name":"Read","content":[],"error":false} | Read | false | 0 | false | 0 | | [] |
      | {"role":"build","name":"Read","content":"","error":false} | Read | false | 0 | false | 1 | | [] |
      | {"role":"build","name":"Read","absent":true,"error":false} | Read | false | 0 | false | 0 | | [] |
      | {"role":"build","name":"Read","content":null,"error":false} | Read | false | 0 | false | 0 | | [] |
      | {"role":"build","name":"Read","content":[{"type":"text","text":"é€"},{"type":"image","source":{}},{"type":"text","text":"boom"}],"error":false} | Read | false | 9 | false | 3 | | ["é€","boom"] |
      | {"role":"build","name":"Read","repeat":{"text":"sk-aaaaaaaaaaaaaaaaaaaa","times":500},"error":false} | Read | false | 11500 | false | 1 | | ["sk-aaaaaaaaaaaaaaaaaaaa"] |
      | {"role":"shape","name":"Write","content":"guard-secret-only","error":true} | Write | true | 17 | true | 1 | | ["guard-secret-only"] |
      | {"role":"build","name":"Edit","content":"reject-secret-only","error":true} | Edit | false | 18 | true | 1 | ,"rejected_before_hook":true | ["reject-secret-only"] |
