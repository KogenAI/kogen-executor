module bounded_guard {
 var offset: int
 var complete: int
 var pending: bool
 var stopped: bool
 var allowed: bool
 action init = all { offset' = 0, complete' = 0, pending' = false, stopped' = false, allowed' = false }
 action addRecord = all { complete' = complete + 1, offset' = offset, pending' = pending, stopped' = stopped, allowed' = allowed }
 action partial = all { pending' = true, complete' = complete, offset' = offset, stopped' = stopped, allowed' = allowed }
 action read = all { offset' = complete, complete' = complete, pending' = pending, stopped' = stopped, allowed' = allowed }
 action result = {
  nondet record = Set("allow", "deny", "missing", "stale").oneOf()
  nondet rejected = Set(true, false).oneOf()
  nondet observable = Set(true, false).oneOf()
  nondet unchanged = Set(true, false).oneOf()
  val ok = record == "allow" or (record == "deny" and rejected) or ((record == "missing" or record == "stale") and rejected and observable and unchanged)
  all { allowed' = ok, stopped' = not(ok), offset' = offset, complete' = complete, pending' = pending }
 }
 action step = any { addRecord, partial, read, result }
 val CursorWithinComplete = offset >= 0 and offset <= complete
 val StopExcludesAllow = not(stopped and allowed)
}
