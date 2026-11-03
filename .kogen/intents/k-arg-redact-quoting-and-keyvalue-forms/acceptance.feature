Feature: Redact secret-named values in tool arguments
  Each round uses the existing fake runtime with exactly one Bash tool_use.
  The synthetic secret is not supplied as an environment or stored token.

  Scenario Outline: Remove complete secret values while preserving surrounding text
    When a "shape" round runs the command: <input>
    Then the Bash command is logged as: <output>
    And no run-log event contains "s3cr3tVALUE9x"

    Examples:
      | input | output |
      | echo '{"password":"s3cr3tVALUE9x","user":"ana"}' | echo '{"password":"[redacted]","user":"ana"}' |
      | curl -H "X-Api-Key: s3cr3tVALUE9x" https://h/x | curl -H "X-Api-Key: [redacted]" https://h/x |
      | curl -u admin:s3cr3tVALUE9x https://h/x | curl -u admin:[redacted] https://h/x |
      | echo "password: s3cr3tVALUE9x" > cfg.yml | echo "password: [redacted]" > cfg.yml |
      | tool --secret=\"s3cr3tVALUE9x\" run | tool --secret=[redacted] run |
      | env TOKEN=$'s3cr3tVALUE9x' ./run | env TOKEN=[redacted] ./run |
      | curl -H "Cookie: session=s3cr3tVALUE9x" h | curl -H "Cookie: [redacted]" h |
      | curl --user admin:s3cr3tVALUE9x https://h/x | curl --user admin:[redacted] https://h/x |
      | echo "'password': 's3cr3tVALUE9x', 'user': 'ana'" | echo "'password': '[redacted]', 'user': 'ana'" |
      | password: s3cr3tVALUE9x | password: [redacted] |
      | curl -H "Set-Cookie: session=s3cr3tVALUE9x; Path=/" h | curl -H "Set-Cookie: [redacted]" h |
      | curl -H "X-Key: s3cr3tVALUE9x" h | curl -H "X-Key: [redacted]" h |
      | curl -H "X-Token: s3cr3tVALUE9x" h | curl -H "X-Token: [redacted]" h |
      | curl -H "X-Secret: s3cr3tVALUE9x" h | curl -H "X-Secret: [redacted]" h |
      | curl -H "X-Auth: s3cr3tVALUE9x" h | curl -H "X-Auth: [redacted]" h |

  Scenario Outline: Preserve non-secret commands exactly
    When a "shape" round runs the command: <command>
    Then the Bash command is logged as: <command>

    Examples:
      | command |
      | git commit -m "fix password prompt" |
      | echo "name: ana" |
