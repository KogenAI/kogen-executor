Feature: Deterministic Claude child environment
  Scenario: Strip companion selectors without stripping transport settings
    When the route selector environment is captured for:
      """
      ["ANTHROPIC_MODEL","ANTHROPIC_DEFAULT_OPUS_MODEL","ANTHROPIC_DEFAULT_SONNET_MODEL","ANTHROPIC_DEFAULT_HAIKU_MODEL","ANTHROPIC_SMALL_FAST_MODEL","CLAUDE_CODE_SUBAGENT_MODEL","ANTHROPIC_CUSTOM_HEADERS","CLAUDE_CODE_EXTRA_BODY","ANTHROPIC_UNIX_SOCKET","ANTHROPIC_BEDROCK_BASE_URL","ANTHROPIC_VERTEX_BASE_URL","ANTHROPIC_VERTEX_PROJECT_ID","ANTHROPIC_FOUNDRY_BASE_URL","ANTHROPIC_FOUNDRY_RESOURCE","CLAUDE_CODE_SKIP_BEDROCK_AUTH","CLAUDE_CODE_SKIP_VERTEX_AUTH","CLAUDE_CODE_SKIP_FOUNDRY_AUTH"]
      """
    Then the route selector capture preserves exactly these required entries and excludes all supplied selectors:
      """
      ["HTTPS_PROXY=proxy","NO_PROXY=local","AWS_REGION=region","PATH=/bin","CLAUDE_CONFIG_DIR=/cfg","HOME=/h","CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1","CLAUDE_CODE_DISABLE_AUTO_MEMORY=1","DISABLE_UPDATES=1"]
      """
    And the round environment excludes parent selectors "ANTHROPIC_MODEL" and "ANTHROPIC_CUSTOM_HEADERS"
