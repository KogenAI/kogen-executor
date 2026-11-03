Feature: Preserve nonsecret tool argument names

  Scenario Outline: Preserve operational names in tool_use arguments
    When a "shape" round runs the command: <command>
    Then the Bash command is logged as: <command>

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
      | tool --no-token host |
      | TOKENS=4096 tool --tokenizer 123 |
      | PASSWORD_PATH=/tmp/pw ./run |
      | SECRET_LENGTH=5 ./run |
      | SECRET_SIZE=5 ./run |
      | TOKEN_TTL=5 ./run |
      | TOKEN_MAX=5 ./run |
      | TOKEN_MIN=5 ./run |
      | tool --PaSsWoRd-FiLe /tmp/pw |

  Scenario Outline: Keep actual secret names redacted
    When a "shape" round runs the command: <command>
    Then the Bash command is logged as: <logged>

    Examples:
      | command | logged |
      | DB_PASSWORD=s3cr3tVALUE9x ./run | DB_PASSWORD=[redacted] ./run |
      | tool --password s3cr3tVALUE9x run | tool --password [redacted] run |
      | API_TOKEN=s3cr3tVALUE9x cmd | API_TOKEN=[redacted] cmd |
      | curl --client-secret=s3cr3tVALUE9x h | curl --client-secret=[redacted] h |
      | API_TOKEN=4096 cmd | API_TOKEN=[redacted] cmd |

  Scenario: Environment secret values are hidden wherever they occur
    Given the adapter environment has "DB_PASSWORD" set to "env-held-FAKE-value-5678"
    When a "shape" round runs the command: echo env-held-FAKE-value-5678 --password-file env-held-FAKE-value-5678 env-held-FAKE-value-5678
    Then the Bash command is logged as: echo [redacted] --password-file [redacted] [redacted]

  Scenario: Stored token redaction overrides nonsecret names
    Given the stored Claude Code token is "stored-FAKE-value-5678"
    When a "shape" round runs the command: PASSWORD_FILE=stored-FAKE-value-5678 ./run
    Then the Bash command is logged as: PASSWORD_FILE=[redacted] ./run

  Scenario: Token formats remain redacted
    When a "shape" round runs the command: echo ghp_FAKEFAKEFAKEFAKEFAKE00
    Then the Bash command is logged as: echo [redacted]
