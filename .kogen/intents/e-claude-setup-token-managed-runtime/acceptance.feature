Feature: The managed Claude Code runtime runs its own setup-token sign-in

  Scenario: Runtime missing: SetupToken installs it once, runs setup-token and returns the token
    Then e-claude-setup-token-managed-runtime: SetupToken runs with the "missing" fake runtime
    And e-claude-setup-token-managed-runtime: the pinned runtime was downloaded 1 time
    And e-claude-setup-token-managed-runtime: out contains "kogen: installing Claude Code 2.1.318 into {home}/.kogen/claude-code/2.1.318"
    And e-claude-setup-token-managed-runtime: the fake runtime ran once with the argument "setup-token"
    And e-claude-setup-token-managed-runtime: the fake runtime ran with Kogen's configuration directory
    And e-claude-setup-token-managed-runtime: the fake runtime read "PASTED-CODE-123" from its standard input
    And e-claude-setup-token-managed-runtime: the fake runtime ran in the caller's process group
    And e-claude-setup-token-managed-runtime: out contains "https://claude.example/oauth/authorize?fake=1"
    And e-claude-setup-token-managed-runtime: out contains "fake runtime notice on stderr"
    And e-claude-setup-token-managed-runtime: the paste prompt reached out while the fake runtime waited
    And e-claude-setup-token-managed-runtime: the call returns the token "sk-ant-oat01-FAKE-SETUP-TOKEN-0123456789"
    And e-claude-setup-token-managed-runtime: out does not contain "Store this token securely"
    And e-claude-setup-token-managed-runtime: the token appears neither in out nor in the error

  Scenario: Runtime already installed: nothing is downloaded and the same token is returned
    Then e-claude-setup-token-managed-runtime: SetupToken runs with the "installed" fake runtime
    And e-claude-setup-token-managed-runtime: the pinned runtime was downloaded 0 times
    And e-claude-setup-token-managed-runtime: out does not contain "kogen: installing Claude Code"
    And e-claude-setup-token-managed-runtime: the fake runtime ran once with the argument "setup-token"
    And e-claude-setup-token-managed-runtime: the call returns the token "sk-ant-oat01-FAKE-SETUP-TOKEN-0123456789"
    And e-claude-setup-token-managed-runtime: the token appears neither in out nor in the error
    And e-claude-setup-token-managed-runtime: out does not contain "Store this token securely"

  Scenario: A token wrapped over two lines with terminal escapes is returned whole
    Then e-claude-setup-token-managed-runtime: SetupToken runs with the "wrapped" fake runtime
    And e-claude-setup-token-managed-runtime: the pinned runtime was downloaded 0 times
    And e-claude-setup-token-managed-runtime: the call returns the token "sk-ant-oat01-FAKE-SETUP-TOKEN-0123456789"
    And e-claude-setup-token-managed-runtime: the token appears neither in out nor in the error

  Scenario: The fake runtime exits non-zero: the run failure is named and no token is returned
    Then e-claude-setup-token-managed-runtime: SetupToken runs with the "fail" fake runtime
    And e-claude-setup-token-managed-runtime: the call returns no token
    And e-claude-setup-token-managed-runtime: the error is unavailable and says "Kogen's Claude Code `setup-token` failed: exit status 3"
    And e-claude-setup-token-managed-runtime: the error names the retry command
    And e-claude-setup-token-managed-runtime: the error does not say "printed no token"
    And e-claude-setup-token-managed-runtime: out contains "fake setup-token failure"
    And e-claude-setup-token-managed-runtime: the token appears neither in out nor in the error

  Scenario: The fake runtime prints no token: the empty-token failure is named
    Then e-claude-setup-token-managed-runtime: SetupToken runs with the "none" fake runtime
    And e-claude-setup-token-managed-runtime: the call returns no token
    And e-claude-setup-token-managed-runtime: the error is unavailable and says "Kogen's Claude Code `setup-token` printed no token"
    And e-claude-setup-token-managed-runtime: the error names the retry command
    And e-claude-setup-token-managed-runtime: the error does not say "`setup-token` failed"
    And e-claude-setup-token-managed-runtime: the token appears neither in out nor in the error

  Scenario: The fake runtime prints an unparsable token: the empty-token failure is named
    Then e-claude-setup-token-managed-runtime: SetupToken runs with the "garbled" fake runtime
    And e-claude-setup-token-managed-runtime: the call returns no token
    And e-claude-setup-token-managed-runtime: the error is unavailable and says "Kogen's Claude Code `setup-token` printed no token"
    And e-claude-setup-token-managed-runtime: the error names the retry command
    And e-claude-setup-token-managed-runtime: the error does not say "`setup-token` failed"
    And e-claude-setup-token-managed-runtime: the token appears neither in out nor in the error

  Scenario: The installer fails: the install failure is named and the runtime never runs
    Then e-claude-setup-token-managed-runtime: SetupToken runs with the "install-fails" fake runtime
    And e-claude-setup-token-managed-runtime: the pinned runtime was downloaded 1 time
    And e-claude-setup-token-managed-runtime: the fake runtime did not run
    And e-claude-setup-token-managed-runtime: the call returns no token
    And e-claude-setup-token-managed-runtime: the error is unavailable and says "cannot install Kogen's Claude Code: "
    And e-claude-setup-token-managed-runtime: the error is unavailable and says "HTTP 404 Not Found"
    And e-claude-setup-token-managed-runtime: the error names the retry command
    And e-claude-setup-token-managed-runtime: out contains "kogen: installing Claude Code 2.1.318 into {home}/.kogen/claude-code/2.1.318"
    And e-claude-setup-token-managed-runtime: the token appears neither in out nor in the error

  Scenario: Dependencies, existing tests and the behaviour of New, Probe and the roles are kept while SetupToken is added
    Then e-claude-setup-token-managed-runtime: go.mod, go.sum and the existing test files keep these SHA-256 digests:
      | path | sha256 |
      | go.mod | 664fcb38ce2ada2031d9d3ed27bbacab8284dee121f896762f3600e5a9c5bb8d |
      | go.sum | 8c6cc622b6a9619465db647b33d5cfdafebf05cdfa22c74662c0b2f6c4096f03 |
      | contract/agent_test.go | 3e134a50c307f1cd696861b782d98408861e24ceb88db65bd0074d1850745022 |
      | contract/claudecode_rounds_test.go | 8e8815a9dbe581aa4e31dec3f6bf5aecafc9265695c1fa64ad318cf133415e29 |
      | contract/claudecode_runtime_test.go | 326451797bbb33a8618be8ca2a1ae5f4d1fe44c262750b886b898269e2e84a92 |
      | contract/conformance_test.go | 3d18b77ee6d3324498f94e6b2ec812bc110bad931cc46633e8974d58305d288e |
      | contract/doc_test.go | d82070f5b1c766a033aafefc463db32f7b1c89b2e3aeea6ad89748cc7fdb1599 |
      | contract/executor_test.go | 6e44681ac4adbdb500d057b60b69f0ae4ce071abb4142942d57bd0cef08b2cd9 |
      | contract/fake_claude_test.go | 47254b537ba11b438d1050976fdf299eb3cf8ab0bdf66af8f959b8b97afda3f9 |
      | contract/helpers_test.go | 2aa2f4e2c539ad08a87afdc738f3c7d70af2c7f4efee1b0bbaf50934c090ad11 |
      | contract/request_golden_test.go | a491e7407ad8a5bbc0c948a60a92983f3119f722b2d4db70410fb860117f42b2 |
      | contract/testproc_test.go | 4f55349a97c6d6214e52d26f70e4bd34be9195bef4425173e7ea047587ea58ad |
      | contract/thinking_test.go | f1441876eb104d339ea8a2d95397cd5d9fbd74d5ef3bf6c07dffcc15a40ecc2f |
      | executor/claudecode/adapter_test.go | 32bb8fb8e167d73789babe70fb279dc98bf36c7c182043de0158437a37db69dc |
      | executor/claudecode/arguments_test.go | e410da24553b444eadc90a14dad9640e739a950db2626c0e0053f334ae0229c7 |
      | executor/claudecode/artifact_dir_mode_test.go | 9f038b547d0b1425f497a25f56b8dd823f9d0677343e4c552c5ffba30c9969e6 |
      | executor/claudecode/artifact_dir_test.go | 772e5beab131e83a76e62e484292ef170ef6b739e0090b055a2585e6cbf21320 |
      | executor/claudecode/bounded_observation_test.go | 8946d99cabfa88afb492d097451db7d0fb8b6e5c70aed3e8d1fb5e8ba9b31ee8 |
      | executor/claudecode/compaction_test.go | 0f7618b33d72e5e5c5df118b95ebff762a2c096cdb9349330be950a93e57da21 |
      | executor/claudecode/cost_baseline_test.go | a83d3c2e658e2ad3c75c4747d8a0a27e2dbfae7c8034566a768e66116219d1c4 |
      | executor/claudecode/denials_test.go | e8b207eb75edb4956bc0bf79090bba5095f5962803645763f1b3ba60bdfd46ff |
      | executor/claudecode/failed_round_usage_test.go | f01a3cdcdba2fe228cb7d8d01b440bd280667896e4560407b943b4fef1f9af2a |
      | executor/claudecode/fake_test.go | a01153e72b91425b807d8890d3188cae3510d17fdc5de445892f49871c08be77 |
      | executor/claudecode/golden_test.go | 1ca4c0605f2fe810fa02e13f6f7af98632b51c75b3da0fb3fa3c688e4fa50f0f |
      | executor/claudecode/hardlink_alias_test.go | 044de5ad3175c5444087fb5bf631c3247823ae33475c1df34d7fbc83ce21b240 |
      | executor/claudecode/hook_cause_test.go | d908cb22cd512d4fdbdab70fa29f97e5a89a4a15fa0c4edd220380a4e4f39b4f |
      | executor/claudecode/hook_test.go | d78008cd571d9210eef68dec06b4034a4ec545baa911dd33e0252b4a2c1e8eb0 |
      | executor/claudecode/interrupt_cause_test.go | ea2ba153b688697dfd4026735bb46aade309e2bb3140c235ad975d493d9b5ac5 |
      | executor/claudecode/lineup_test.go | 58910c20708ee7d50219b7b43f303ddf8d52e92c873cb49b84c61824df61c938 |
      | executor/claudecode/model_usage_test.go | feba23f29b86cb9f59e3ea84e3794f7e2b2ddf765bc38abbe05e66cc93411814 |
      | executor/claudecode/persistence_test.go | 793cba9c088ae7d2239572a65e6d1946b8388297cab7fbaaa8cfc528be65c297 |
      | executor/claudecode/preflight_process_test.go | 39b82de8b4269d486b17b7d8572967a37aec660a5f2c29fa1d085254412ebcba |
      | executor/claudecode/prompt_size_test.go | 666cbd8712a06fda16ef899906c1e954e065e245118637c161ce621a15287aaf |
      | executor/claudecode/protected_test.go | 909b6b5843cd6ed3f156ca3553678932d4694747dbac48434baaca7101129466 |
      | executor/claudecode/provider_unavailable_test.go | 286184dd901a21b8969978b93e20f6edf686a442c415feb84deb738274b2bc62 |
      | executor/claudecode/result_telemetry_test.go | 11ee2e130758829956e31355a4e0b8d8cfe9e2f1de4f26c0cb149274affc475e |
      | executor/claudecode/round_models_test.go | c271ba2b56bbf1d0ba2d8a3ef9c3d6d9c835fcf62c47022c3f691fc10d31ba3a |
      | executor/claudecode/runtime_test.go | 551d345ed5cc5fc3cde5accaa607417a75f19389a2d1c2ea87145711e44fed32 |
      | executor/claudecode/shape_hookless_test.go | bb8e9150257e1385c8b519506659c1672133ec4165d0f768ed07571d2cd30593 |
      | executor/claudecode/stream_limit_test.go | 5cc3eec24c5fec9461885095246aa1beaf61a61b434a634e5b1527b2491657b3 |
      | executor/claudecode/stream_profile_test.go | b86807f781793dd59c70e9774bbf6aeb12d416fb75be9be27fef852d1c81dda4 |
      | executor/claudecode/token_transport_test.go | 07b9e816325e2f68557961199f20ac339672e03ca3cfabafaab8a1ac38c1e3c7 |
      | executor/claudecode/transcripts_test.go | 404b7e45d76a84890fc243f02e4fee97d2d85593108f309be3d97aff4df8f713 |
      | executor/claudecode/unanswered_test.go | 6875c0f00993bcb493a21d2c8efa8b26641c14a26bef3a33021e07c7a2bc6763 |
      | executor/claudecode/usage_limit_test.go | e5090b09798a712f3bd4432e307eaf131fe83f786f78054f864d9e6fcb54f6f2 |
      | executor/claudecode/version_observation_test.go | a487ee0175d87fba3b82f82ddaaac225fb8b6d2582372047d53a89ecd18b8346 |
      | executor/claudecode/wakeup_test.go | e79f4108034eb09bb0d845dc68783d33e02d51eb1d2f4e997b0b5676a1b6668d |
    And e-claude-setup-token-managed-runtime: the existing tests of package claudecode and the contract suite pass
    And e-claude-setup-token-managed-runtime: SetupToken runs with the "installed" fake runtime
    And e-claude-setup-token-managed-runtime: the call returns the token "sk-ant-oat01-FAKE-SETUP-TOKEN-0123456789"
