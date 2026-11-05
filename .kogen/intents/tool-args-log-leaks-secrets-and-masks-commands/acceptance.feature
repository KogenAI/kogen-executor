Feature: Redact tool-argument secrets without masking ordinary commands
  Each scenario runs one real Claude Code adapter Shape round against the scripted fake runtime
  with exactly one tool_use and checks the executor_tool record's arguments. The secret value is
  s3cr3tVALUE9x. {{text*n}} in a fixture stands for text repeated n times.

  Scenario Outline: Secret values in value forms and new name spellings are redacted, the rest stays
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: <command>
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged as: <logged>
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "s3cr3tVALUE9x"

    Examples:
      | command | logged |
      | echo '{"password":"s3cr3tVALUE9x","user":"ana"}' | echo '{"password":"[redacted]","user":"ana"}' |
      | curl -H "X-Api-Key: s3cr3tVALUE9x" https://h/x | curl -H "X-Api-Key: [redacted]" https://h/x |
      | curl -u admin:s3cr3tVALUE9x https://h/x | curl -u admin:[redacted] https://h/x |
      | echo "password: s3cr3tVALUE9x" > cfg.yml | echo "password: [redacted]" > cfg.yml |
      | curl -H "Cookie: session=s3cr3tVALUE9x" h | curl -H "Cookie: [redacted]" h |
      | echo "Cookie: theme=dark; session=s3cr3tVALUE9x" > req.txt | echo "Cookie: [redacted]" > req.txt |
      | curl -H "X-Password: open s3cr3tVALUE9x" h | curl -H "X-Password: [redacted]" h |
      | echo '{"accessToken":"s3cr3tVALUE9x"}' | echo '{"accessToken":"[redacted]"}' |
      | //registry.example.test/:_authToken=s3cr3tVALUE9x | //registry.example.test/:_authToken=[redacted] |
      | export refreshToken=s3cr3tVALUE9x | export refreshToken=[redacted] |
      | AWS_CREDENTIALS=s3cr3tVALUE9x ./run | AWS_CREDENTIALS=[redacted] ./run |
      | DOCKER_SECRETS=s3cr3tVALUE9x ./run | DOCKER_SECRETS=[redacted] ./run |
      | curl --cookie s3cr3tVALUE9x host | curl --cookie [redacted] host |
      | ENCRYPTION_KEY=s3cr3tVALUE9x ./run | ENCRYPTION_KEY=[redacted] ./run |
      | SIGNING_KEY=s3cr3tVALUE9x ./run | SIGNING_KEY=[redacted] ./run |
      | MASTER_KEY=s3cr3tVALUE9x ./run | MASTER_KEY=[redacted] ./run |
      | SESSION_KEY=s3cr3tVALUE9x ./run | SESSION_KEY=[redacted] ./run |
      | DECRYPTION_KEY=s3cr3tVALUE9x ./run | DECRYPTION_KEY=[redacted] ./run |
      | AUTHORIZATION=s3cr3tVALUE9x ./run | AUTHORIZATION=[redacted] ./run |
      | tool --bearer s3cr3tVALUE9x run | tool --bearer [redacted] run |
      | clientSecret=s3cr3tVALUE9x ./run | clientSecret=[redacted] ./run |
      | privateKey=s3cr3tVALUE9x ./run | privateKey=[redacted] ./run |
      | apikey=s3cr3tVALUE9x ./run | apikey=[redacted] ./run |
      | authtoken=s3cr3tVALUE9x ./run | authtoken=[redacted] ./run |
      | accesstoken=s3cr3tVALUE9x ./run | accesstoken=[redacted] ./run |
      | refreshtoken=s3cr3tVALUE9x ./run | refreshtoken=[redacted] ./run |
      | clientsecret=s3cr3tVALUE9x ./run | clientsecret=[redacted] ./run |
      | privatekey=s3cr3tVALUE9x ./run | privatekey=[redacted] ./run |
      | API_TOKENS=s3cr3tVALUE9x ./run | API_TOKENS=[redacted] ./run |

  Scenario: A YAML secret-named pair in a heredoc is redacted
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round makes a "Bash" tool call with input:
      """
      {"command": "cat > cfg.yml <<'EOF'\nsigningKey: s3cr3tVALUE9x\nregion: eu\nEOF"}
      """
    Then tool-args-log-leaks-secrets-and-masks-commands: the tool call is logged with arguments:
      """
      {"command": "cat > cfg.yml <<'EOF'\nsigningKey: [redacted]\nregion: eu\nEOF"}
      """
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "s3cr3tVALUE9x"

  Scenario: Secret-named JSON keys in new spellings are redacted, other keys stay
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round makes a "mcp__fixture__configure" tool call with input:
      """
      {"accessToken": "s3cr3tVALUE9x", "clientSecret": "s3cr3tVALUE9x", "privateKey": "s3cr3tVALUE9x", "db.password": "s3cr3tVALUE9x", "keyboardLayout": "us", "cookieCount": 3, "max_tokens": 4096, "user": "ana"}
      """
    Then tool-args-log-leaks-secrets-and-masks-commands: the tool call is logged with arguments:
      """
      {"accessToken": "[redacted]", "clientSecret": "[redacted]", "privateKey": "[redacted]", "db.password": "[redacted]", "keyboardLayout": "us", "cookieCount": 3, "max_tokens": 4096, "user": "ana"}
      """
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "s3cr3tVALUE9x"

  Scenario: A backslash-quoted option value is removed whole, with no fragment or leftover quote
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: tool --secret=\"s3cr3tVALUE9x\" run
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged as: tool --secret=[redacted] run
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "s3cr3tVALUE9x"

  Scenario: An ANSI-C quoted value is removed whole, with no fragment or leftover quote
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: env TOKEN=$'s3cr3tVALUE9x' ./run
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged as: env TOKEN=[redacted] ./run
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "s3cr3tVALUE9x"

  Scenario Outline: New token shapes are replaced whole
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: echo <token> done
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged as: echo [redacted] done
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "<token>"

    Examples:
      | token |
      | sk_live_{{FAKE*6}} |
      | rk_live_{{FAKE*6}} |
      | sk_test_{{FAKE*6}} |
      | glpat-{{Fake0*4}} |
      | npm_{{Fake00*6}} |
      | AIza{{Fake0*7}} |
      | xapp-1-A0-123-abc |
      | eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.ZmFrZXNpZ25hdHVyZQ |

  Scenario: A token is replaced inside a URL in a quoted string
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: curl "https://h.example.test/v1?key=AIza{{Fake0*7}}&q=1"
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged as: curl "https://h.example.test/v1?key=[redacted]&q=1"
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "AIza{{Fake0*7}}"

  Scenario: Tokens are replaced inside JSON string values
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round makes a "mcp__fixture__deploy" tool call with input:
      """
      {"note": "publish with npm_{{Fake00*6}}", "target": {"url": "https://h.example.test/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.ZmFrZXNpZ25hdHVyZQ", "keys": ["sk_test_{{FAKE*6}}"]}}
      """
    Then tool-args-log-leaks-secrets-and-masks-commands: the tool call is logged with arguments:
      """
      {"note": "publish with [redacted]", "target": {"url": "https://h.example.test/?t=[redacted]", "keys": ["[redacted]"]}}
      """

  Scenario: Strings that only resemble a token prefix, or are shorter than its minimum, are kept
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: echo npm_config_cache sk_learn eyJ glpat- AIza{{Fake0*6}}Fake sk_live_{{FAKE*5}}FAK glpat-{{Fake0*3}}Fake npm_{{Fake00*5}}Fake0
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged unchanged

  Scenario Outline: Commands whose names only contain a secret word are logged byte for byte
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: <command>
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged unchanged

    Examples:
      | command |
      | python run.py --tokenizer=cl100k --max-tokens=4096 |
      | TOKEN_COUNT=5 ./gen |
      | npm run lint -- --token-limit 5 |
      | PASSWORD_FILE=/run/secrets/pw ./run |
      | vault read --password-file /run/secrets/pw |
      | docker login --password-stdin registry.example.com |
      | pg_dump --no-password db |
      | CREDENTIAL_HELPER=store git push |
      | SECRET_NAME=prod-db kubectl get secret prod-db |
      | keyboardLayout=us |
      | cookieCount=3 |
      | accessTokenFile=/run/secrets/t |
      | --no-cookie |
      | git commit -m "fix password prompt" |
      | echo "name: ana" |
      | tool --tokens 4096 run |
      | TOKENS=4096 tool --tokenizer 123 |

  Scenario Outline: Values redacted today stay redacted
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: <command>
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged as: <logged>
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "s3cr3tVALUE9x"

    Examples:
      | command | logged |
      | DB_PASSWORD=s3cr3tVALUE9x ./run | DB_PASSWORD=[redacted] ./run |
      | tool --password s3cr3tVALUE9x run | tool --password [redacted] run |
      | API_TOKEN=s3cr3tVALUE9x cmd | API_TOKEN=[redacted] cmd |
      | curl --client-secret=s3cr3tVALUE9x h | curl --client-secret=[redacted] h |

  Scenario Outline: A secret-named environment value is replaced wherever it appears
    Given tool-args-log-leaks-secrets-and-masks-commands: the adapter environment has "<name>" set to "s3cr3tVALUE9x"
    When tool-args-log-leaks-secrets-and-masks-commands: a shape round runs the command: echo s3cr3tVALUE9x --password-file s3cr3tVALUE9x > out.txt
    Then tool-args-log-leaks-secrets-and-masks-commands: the Bash command is logged as: echo [redacted] --password-file [redacted] > out.txt
    And tool-args-log-leaks-secrets-and-masks-commands: no run-log event contains "s3cr3tVALUE9x"

    Examples:
      | name |
      | DB_PASSWORD |
      | AWS_CREDENTIALS |
