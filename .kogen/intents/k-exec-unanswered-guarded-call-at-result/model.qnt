module unanswered {
  var pending: bool
  var accepted: bool
  var safe: bool
  var reported: bool
  action init = all { pending' = false, accepted' = false, safe' = true, reported' = false }
  action start = all { not(pending), not(accepted), pending' = true, safe' = false, reported' = false, accepted' = false }
  action answer = all { pending, not(accepted), pending' = false, safe' = true, reported' = false, accepted' = false }
  action validate = all { pending, not(accepted), pending' = true, safe' = true, reported' = false, accepted' = false }
  action accept = all { safe, accepted' = true, reported' = pending, pending' = pending, safe' = safe }
  action step = any { start, answer, validate, accept }
  val GuardBeforeAccept = accepted implies safe
  val ReportUnanswered = (accepted and pending) implies reported
}
