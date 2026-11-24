Feature: Direct NonNil slice tests
  This feature closes evidence gap ev-6acaddc1 in core/util_test.go without
  changing core/util.go or JSON serialization behavior elsewhere.

  Scenario: Nil slices become non-nil empty slices
    Given core-nonnil-slice-tests: the utility source and test file exist
    # A length-only check incorrectly accepts a nil result, which can encode as JSON null.
    Then core-nonnil-slice-tests: direct tests require a non-nil zero-length result for a nil slice

  Scenario: Populated slices keep their elements and order
    Given core-nonnil-slice-tests: the utility source and test file exist
    # Returning a newly constructed empty slice for every input must not survive.
    # Reversing or dropping populated elements must not survive either.
    Then core-nonnil-slice-tests: direct tests require populated elements in their original order
