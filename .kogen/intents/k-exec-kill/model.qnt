module k_exec_kill {
  var owner: bool
  var active: bool
  var supervisor: bool
  var finished: bool

  action init = all { owner' = true, active' = false, supervisor' = false, finished' = false }
  action launch = all { owner, not(active), not(finished), owner' = owner, active' = true, supervisor' = true, finished' = false }
  action die = all { owner, owner' = false, active' = active, supervisor' = supervisor, finished' = finished }
  action cleanup = all { supervisor, owner' = owner, active' = false, supervisor' = false, finished' = true }
  action idle = all { owner' = owner, active' = active, supervisor' = supervisor, finished' = finished }
  action step = any { launch, die, cleanup, idle }
  val Custody = active implies (owner or supervisor)
  val CleanFinish = finished implies not(active)
}
