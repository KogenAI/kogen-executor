Feature: Report cache creation separately from reads

  Scenario Outline: Map result usage through the real adapter
    When k-exec-usage-cache-write: the adapter receives this result:
      """
      <result>
      """
    Then k-exec-usage-cache-write: the terminal usage is:
      """
      <expected>
      """
    Examples:
      | result | expected |
      | {"type":"result","subtype":"success","is_error":false,"result":"done","num_turns":1,"usage":{"input_tokens":10,"cache_read_input_tokens":700,"cache_creation_input_tokens":300,"output_tokens":5}} | {"event":"executor_round_ended","usage":{"input":1010,"cached":700,"cache_write":300,"output":5,"reasoning":null,"state":"complete"}} |
      | {"type":"result","subtype":"success","is_error":false,"result":"done","num_turns":1,"usage":{"input_tokens":10,"cache_creation_input_tokens":300,"output_tokens":5}} | {"event":"executor_round_ended","usage":{"input":null,"cached":null,"cache_write":300,"output":5,"reasoning":null,"state":"partial"}} |
      | {"type":"result","subtype":"success","is_error":false,"result":"done","num_turns":1} | {"event":"executor_round_ended","usage":{"input":null,"cached":null,"cache_write":null,"output":null,"reasoning":null,"state":"unknown"}} |
      | {"type":"result","subtype":"error_during_execution","is_error":true,"terminal_reason":"api_error","result":"boom","num_turns":1,"usage":{"input_tokens":10,"cache_read_input_tokens":700,"cache_creation_input_tokens":300,"output_tokens":5}} | {"event":"executor_round_failed","usage":{"input":1010,"cached":700,"cache_write":300,"output":5,"reasoning":null,"state":"complete"}} |
      | {"type":"result","subtype":"success","is_error":false,"result":"done","num_turns":1,"usage":{"cache_creation_input_tokens":300}} | {"event":"executor_round_ended","usage":{"input":null,"cached":null,"cache_write":300,"output":null,"reasoning":null,"state":"partial"}} |
      | {"type":"result","subtype":"success","is_error":false,"result":"done","num_turns":1,"usage":{"cache_creation_input_tokens":0}} | {"event":"executor_round_ended","usage":{"input":null,"cached":null,"cache_write":0,"output":null,"reasoning":null,"state":"partial"}} |

  Scenario: Existing usage goldens retain every old field
    Then k-exec-usage-cache-write: existing usage goldens differ only by cache_write
