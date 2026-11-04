# Executor dependency consumption inventory

These external-package suites pin the versions in the root module; `contract/`
continues to describe executor as a provider. Run `go test ./consumes/...`.
To reconcile this list, enumerate imports of kogen-coordinator and kogen-loop
in every non-test Go file (excluding feature-driver programs), then trace each
import alias's selectors, values passed across the boundary, and fields and
methods read from those values. Reconcile each against the assertions below,
not just the imported package names. Tests use local synthetic data and Git.

| Consumer source | Producer item and consumed fields/methods | Assertion |
| --- | --- | --- |
| agent/git.go | coordinator/git Repo, Run, Result Stdout/Stderr/Status, Head, Tree | coordinator TestGitConsumption: success, command failure, forbidden command, empty/committed head, snapshot exclusion and empty start |
| core/state.go | coordinator/project Role Provider/Model/Effort/BaseURL | coordinator TestRoleConsumption |
| agent/budget.go | loop/provider Client.ResponseBudget, ResponseBudget | loop TestProviderConsumption: 30m and writable 10m |
| core/state.go | loop/provider Role Provider/Model/Effort/BaseURL, Name; Response Usage/Known; Usage and KnownUsage Input/Cached/Output/Reasoning | loop TestProviderConsumption: routing, fields and known/unknown counts |
| agent/budget.go, agent/origin_hint.go | loop/sys Error Class/Reason/Detail/Lines, copied error | loop TestSysConsumption: fields and lines |
| core/util.go, executor/executor.go, executor/claudecode/session.go, executor/claudecode/stream.go | loop/sys Fail | loop TestSysConsumption: fields and text |
| executor/claudecode/session.go, executor/conformance/conformance.go | loop/sys AsError | loop TestSysConsumption: wrapped and unrelated errors |
| executor/claudecode/session.go | loop/sys Interrupted Signal and error | loop TestSysConsumption: context causes for SIGINT, SIGTERM, SIGHUP |
| agent/defs.go | loop/tools Definition and AsAny | loop TestToolsConsumption: seven definitions, schemas, required fields, unknown name and ordered flattening |
| agent/git.go | loop/tools Git Run/Head/Tree, GitResult Stdout/Stderr/Status | loop TestToolsConsumption: synthetic implementation through interface |
| core/util.go | loop/tools Tools.Definition for shell | loop TestToolsConsumption: shell definition |
