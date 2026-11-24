Feature: Pin HashHex with direct known SHA-256 vectors
  This feature closes the direct-test gap identified by evidence ev-eb380459.
  The delivered change is confined to core/util_test.go; HashHex and dependencies remain unchanged.
  Full digest comparisons must detect incorrect content even when its length is correct.

  Background:
    Given core-hashhex-test-vectors: the utility source and direct test file are present

  Scenario: Pin a known non-empty SHA-256 digest
    Then core-hashhex-test-vectors: direct tests pin input "abc" to "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" and reject a same-length incorrect digest

  Scenario: Pin the SHA-256 digest of empty bytes
    Then core-hashhex-test-vectors: direct tests pin input "" to "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" and reject a same-length incorrect digest
