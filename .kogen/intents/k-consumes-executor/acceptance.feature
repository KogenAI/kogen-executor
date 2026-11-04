Feature: k-consumes-executor dependency consumption contracts
  Scenario: Both public-only producer suites run locally
    Then k-consumes-executor: this command succeeds
      """
      test -s consumes/README.md && go test -count=1 ./consumes/kogen-coordinator/... ./consumes/kogen-loop/...
      """

  Scenario: Existing token transport reproducing cases remain protected
    Then k-consumes-executor: this command succeeds
      """
      GOFLAGS=-trimpath go test -count=1 ./executor/claudecode -run '^(TestLargeTokenPreflightRefusedBeforeStart|TestRoundTokenTransport|TestRoundShortAndEmptyTokenDelivery|TestTokenTransportSizeBoundary)$'
      """

  Scenario: Normal test graph includes the suites without module drift
    Then k-consumes-executor: this command succeeds
      """
      printf '%s\n' '6226924763ee651b341d0892d9f447a6ad996c4011994f18e647e95f031af1e1  go.mod' '106e551880e06f9418734c3e530aa1c5bdb6d879110790413b83a602d3530792  go.sum' | sha256sum -c - && go build ./... && go vet ./... && GOFLAGS=-trimpath go test ./... && test -z "$(gofmt -l .)"
      """
