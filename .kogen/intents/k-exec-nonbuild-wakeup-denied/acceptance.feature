Feature: Deny scheduled wakeups in every Claude Code role
  Scenario: All first and resumed rounds enforce the same wakeup boundary
    Then k-exec-nonbuild-wakeup-denied: the following round contract holds
      """
      {"Roles":["shape","build","review"],"Rounds":[1,2],"Sentence":"Scheduled wakeups are unavailable; await commands and their completion within the current round.","ShapeTools":["Edit","Write","MultiEdit","NotebookEdit"],"Wakeup":"ScheduleWakeup"}
      """

  Scenario: Build framing does not change
    Then k-exec-nonbuild-wakeup-denied: Build framing remains exactly
      """
      You are implementing one requested feature in this Git checkout, the current directory. Kogen will independently run the configured checks, an independent review and the single commit.
      Do not commit, push, switch branches, stash or rewrite Git state.
      Do not edit the protected paths named in the task: edits to them are refused, and any change to them is detected and stops the Build.
      If observed evidence demonstrates that current protected files contradict the approved behavior or contain a fixture defect, report a blocker in the blocker field of your structured final result, with their exact protected paths, a concrete reason and observed command/step/error evidence. Do not change production semantics solely to accommodate a demonstrated bad fixture. A valid report stops as BUILDER-REPORTED build_blocked with candidate/index/approval preserved; it is not independently proven and grants no protected edits, automatic refinement or approval. Plain blocked text does not stop the Build.
      Scheduled wakeups are unavailable; await commands and their completion within the current round.
      When you believe the work is complete, stop and summarize what you changed.
      """
