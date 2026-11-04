module benignTail {
  var finished: bool
  var failed: bool
  var count: int
  var claim: int
  action init = all { finished' = false, failed' = false, count' = 0, claim' = 0 }
  action result = all { not(finished), not(failed), finished' = true, failed' = false, count' = count, claim' = 7 }
  action benign = all { finished, not(failed), finished' = true, failed' = false, count' = if (count < 2147483647) count + 1 else count, claim' = claim }
  action invalid = all { finished, not(failed), finished' = true, failed' = true, count' = count, claim' = claim }
  action stay = all { finished' = finished, failed' = failed, count' = count, claim' = claim }
  action step = any { result, benign, invalid, stay }
  val Preserved = finished implies claim == 7
  val Bounded = count >= 0 and count <= 2147483647
  val FailureAfterResult = failed implies finished
}
