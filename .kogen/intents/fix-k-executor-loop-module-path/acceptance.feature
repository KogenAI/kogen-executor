Feature: The landed loop import check covers generated-test templates
  Each scenario copies the checkout's working tree (without .git, node_modules and .kogen/local) to a
  temporary directory and applies the listed fixture changes there: {file, from, to} replaces text in
  an existing file, {file, create} writes a new file. It then runs only the scenario "Remove bare
  imports from repository and actual build dependencies" of
  .kogen/intents/k-executor-loop-module-path/acceptance.feature in that copy, through Cucumber with
  features/steps/k-executor-loop-module-path__steps.js. The result is the status of that scenario's
  single step and Cucumber's exit status.

  Scenario: The landed import check passes on the unchanged tree
    When fix-k-executor-loop-module-path: the landed import check runs on a copy of the checkout with:
      """
      []
      """
    Then fix-k-executor-loop-module-path: the landed import check result is:
      """
      {"statuses":["PASSED"],"exit":0}
      """

  Scenario: A bare loop import in a generated-test template fails the landed import check
    When fix-k-executor-loop-module-path: the landed import check runs on a copy of the checkout with:
      """
      [{"file":"features/steps/overload_capture_test.go.txt","from":"\"github.com/KogenAI/kogen-loop/sys\"","to":"\"kogen-loop/sys\""}]
      """
    Then fix-k-executor-loop-module-path: the landed import check result is:
      """
      {"statuses":["FAILED"],"exit":1}
      """

  Scenario: A bare loop import in a build-ignored Go source still fails the landed import check
    When fix-k-executor-loop-module-path: the landed import check runs on a copy of the checkout with:
      """
      [{"file":"agent/zz_bare_loop_import.go","create":"//go:build ignore\n\npackage agent\n\nimport _ \"kogen-loop/sys\"\n"}]
      """
    Then fix-k-executor-loop-module-path: the landed import check result is:
      """
      {"statuses":["FAILED"],"exit":1}
      """
