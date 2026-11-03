Feature: Public executor documentation
  Scenario: Explain the component and public setup
    Then public document "README.md" contains literal "kogen-executor"
    And public document "README.md" contains literal "https://github.com/KogenAI/kogen"
    And public document "README.md" contains literal "Go 1.27.2"
    And public document "README.md" contains literal "git clone https://github.com/KogenAI/kogen-executor"
    And public document "README.md" contains literal "go mod download"
    And public document "README.md" contains literal "go build ./... && go vet ./... && go test -race -count=1 ./..."
    And public document "README.md" contains literal "go test ./contract/..."
    And public document "README.md" contains literal "go test ./... -update"

  Scenario: Remove obsolete setup and provide one inquiry address
    Then public document "README.md" excludes literal "GOPRIVATE"
    And public document "README.md" excludes literal "insteadOf"
    And public document "README.md" excludes literal "private KogenAI modules"
    And public document "README.md" has 1 occurrence of literal "contact@kogen.dev"

  Scenario: Keep public documentation free of identifying environments
    Then public documentation has no identifying environment signatures
    And public policy file "SECURITY.md" is absent
    And public policy file "CONTRIBUTING.md" is absent
    And public policy file "BRANDING.md" is absent

  Scenario: Deliver a public tree and history audit
    Then public document "docs/public-readiness-audit.md" contains literal "Current tree"
    And public document "docs/public-readiness-audit.md" contains literal "Links"
    And public document "docs/public-readiness-audit.md" contains literal "History"
    And public document "docs/public-readiness-audit.md" contains literal "Coverage"
