Feature: The parent shell environment does not change Claude Code rounds

  Scenario: childEnv strips model, Git and behaviour variables and keeps the rest
    When parent-shell-env-changes-claude-rounds: childEnv runs over a base of these kept entries, inherited overrides of the managed values and every one of these stripped names:
      """
      {
        "kept": ["PATH=/bin", "HTTPS_PROXY=http://proxy.invalid:3128", "NO_PROXY=localhost", "AWS_REGION=eu-west-1", "SSL_CERT_FILE=/etc/ssl/cert.pem", "LANG=C.UTF-8", "GIT_TERMINAL_PROMPT=0", "GIT_SSH_COMMAND=ssh -o BatchMode=yes", "GIT_OPTIONAL_LOCKS=1"],
        "stripped": [
          "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_FABLE_MODEL",
          "ANTHROPIC_SMALL_FAST_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE",
          "ANTHROPIC_CUSTOM_HEADERS", "CLAUDE_CODE_EXTRA_BODY", "ANTHROPIC_UNIX_SOCKET",
          "ANTHROPIC_BEDROCK_BASE_URL", "ANTHROPIC_VERTEX_BASE_URL", "ANTHROPIC_VERTEX_PROJECT_ID", "ANTHROPIC_FOUNDRY_BASE_URL", "ANTHROPIC_FOUNDRY_RESOURCE",
          "CLAUDE_CODE_SKIP_BEDROCK_AUTH", "CLAUDE_CODE_SKIP_VERTEX_AUTH", "CLAUDE_CODE_SKIP_FOUNDRY_AUTH",
          "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_NAMESPACE",
          "GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0", "GIT_CONFIG_KEY_12", "GIT_CONFIG_VALUE_12",
          "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM",
          "MAX_THINKING_TOKENS", "CLAUDE_CODE_MAX_OUTPUT_TOKENS", "MAX_MCP_OUTPUT_TOKENS",
          "BASH_DEFAULT_TIMEOUT_MS", "BASH_MAX_TIMEOUT_MS", "BASH_MAX_OUTPUT_LENGTH", "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR",
          "DISABLE_PROMPT_CACHING", "DISABLE_PROMPT_CACHING_HAIKU", "DISABLE_PROMPT_CACHING_SONNET", "DISABLE_PROMPT_CACHING_OPUS", "DISABLE_PROMPT_CACHING_FABLE"
        ]
      }
      """
    Then parent-shell-env-changes-claude-rounds: the child environment has none of the stripped names and is exactly:
      """
      ["PATH=/bin", "HTTPS_PROXY=http://proxy.invalid:3128", "NO_PROXY=localhost", "AWS_REGION=eu-west-1", "SSL_CERT_FILE=/etc/ssl/cert.pem", "LANG=C.UTF-8", "GIT_TERMINAL_PROMPT=0", "GIT_SSH_COMMAND=ssh -o BatchMode=yes", "GIT_OPTIONAL_LOCKS=1",
       "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1", "CLAUDE_CODE_DISABLE_AUTO_MEMORY=1", "DISABLE_UPDATES=1", "CLAUDE_CONFIG_DIR=/cfg", "HOME=/h"]
      """
    And parent-shell-env-changes-claude-rounds: shapeEnv over the child environment yields exactly one "GIT_OPTIONAL_LOCKS=0" and changes nothing else

  Scenario: Rounds of every role ignore the parent's model, headers and behaviour variables
    When parent-shell-env-changes-claude-rounds: a Build, a Shape and a Review round run with no requested model while the parent environment holds:
      """
      ["ANTHROPIC_MODEL=x", "ANTHROPIC_CUSTOM_HEADERS=h", "MAX_THINKING_TOKENS=1", "BASH_DEFAULT_TIMEOUT_MS=1"]
      """
    Then parent-shell-env-changes-claude-rounds: no round passed --model and the fake claude of every round saw none of these variables:
      """
      ["ANTHROPIC_MODEL", "ANTHROPIC_CUSTOM_HEADERS", "MAX_THINKING_TOKENS", "BASH_DEFAULT_TIMEOUT_MS"]
      """
    And parent-shell-env-changes-claude-rounds: the fake claude of the Shape round saw exactly one "GIT_OPTIONAL_LOCKS=0"

  Scenario Outline: Git in a round targets the checkout although the parent exports <variables>
    When parent-shell-env-changes-claude-rounds: a Build round's fake claude runs "git rev-parse --show-toplevel --absolute-git-dir" in the checkout while the parent exports "<variables>" for another repository
    Then parent-shell-env-changes-claude-rounds: git printed the checkout's top level and Git directory, never the other repository

    Examples:
      | variables             |
      | GIT_DIR               |
      | GIT_DIR,GIT_WORK_TREE |

  Scenario Outline: <file> names every variable Kogen strips
    Then parent-shell-env-changes-claude-rounds: "<file>" names every one of these variables in backticks:
      """
      [
        "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
        "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
        "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR", "CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR", "ANTHROPIC_PROFILE",
        "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_FABLE_MODEL",
        "ANTHROPIC_SMALL_FAST_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE",
        "ANTHROPIC_CUSTOM_HEADERS", "CLAUDE_CODE_EXTRA_BODY", "ANTHROPIC_UNIX_SOCKET",
        "ANTHROPIC_BEDROCK_BASE_URL", "ANTHROPIC_VERTEX_BASE_URL", "ANTHROPIC_VERTEX_PROJECT_ID", "ANTHROPIC_FOUNDRY_BASE_URL", "ANTHROPIC_FOUNDRY_RESOURCE",
        "CLAUDE_CODE_SKIP_BEDROCK_AUTH", "CLAUDE_CODE_SKIP_VERTEX_AUTH", "CLAUDE_CODE_SKIP_FOUNDRY_AUTH",
        "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN",
        "AWS_PROFILE", "AWS_DEFAULT_PROFILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_CONFIG_FILE",
        "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_BEARER_TOKEN_BEDROCK",
        "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_ACCESS_TOKEN",
        "ANTHROPIC_FOUNDRY_API_KEY", "AZURE_CLIENT_SECRET", "AZURE_CLIENT_CERTIFICATE_PATH",
        "CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_ENTRYPOINT",
        "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_SESSION_ATTENDED",
        "CLAUDE_PID", "CLAUDE_EFFORT", "CLAUDE_CODE_EXECPATH", "CLAUDE_CODE_EFFORT_LEVEL", "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB",
        "CLAUDE_CONFIG_DIR", "DISABLE_UPDATES",
        "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_NAMESPACE",
        "GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_<n>", "GIT_CONFIG_VALUE_<n>",
        "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM",
        "MAX_THINKING_TOKENS", "CLAUDE_CODE_MAX_OUTPUT_TOKENS", "MAX_MCP_OUTPUT_TOKENS",
        "BASH_DEFAULT_TIMEOUT_MS", "BASH_MAX_TIMEOUT_MS", "BASH_MAX_OUTPUT_LENGTH", "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR",
        "DISABLE_PROMPT_CACHING", "DISABLE_PROMPT_CACHING_HAIKU", "DISABLE_PROMPT_CACHING_SONNET", "DISABLE_PROMPT_CACHING_OPUS", "DISABLE_PROMPT_CACHING_FABLE"
      ]
      """

    Examples:
      | file                      |
      | docs/configuration.md     |
      | docs/executor-contract.md |
