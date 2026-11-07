Feature: e-claude-code-2-1-318 managed runtime pin
  # The managed installation directory is ~/.kogen/claude-code/2.1.318.
  Scenario: Public managed-runtime values name the requested release
    Then e-claude-code-2-1-318: Version is "2.1.318"
    And e-claude-code-2-1-318: the managed path for "/h" is "/h/.kogen/claude-code/2.1.318/claude"
    And e-claude-code-2-1-318: refusal for "/managed/claude" reporting "2.1.314 (Claude Code)" is "Kogen's Claude Code at /managed/claude reports 2.1.314 (Claude Code), not the pinned 2.1.318"
