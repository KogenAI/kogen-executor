Feature: Direct coverage of ResumeRefused
  This feature checks the utility tests themselves; scratch changes to the helper are not delivered.

  Background:
    Given core-resume-refused-contract-test: the utility source and test file are present

  Scenario: Supplied detail is preserved with the refusal classification
    Then core-resume-refused-contract-test: the direct tests require class "candidate", reason "resume_refused", unchanged supplied detail and exit code 1

  Scenario: Empty detail remains empty with the same refusal classification
    Then core-resume-refused-contract-test: the direct tests require class "candidate", reason "resume_refused", empty detail and exit code 1 when detail is empty
