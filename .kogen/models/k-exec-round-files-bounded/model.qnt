module bounded {
  var kept: int
  var lost: int
  var parsed: int
  var stopped: bool
  action init = all { kept' = 0, lost' = 0, parsed' = 0, stopped' = false }
  action step = {
    nondet amount = 1.to(3).oneOf()
    nondet wholeLine = Set(true, false).oneOf()
    val room = 4 - kept
    val save = if (stopped) 0 else if (amount <= room) amount else if (wholeLine) 0 else room
    all {
      kept' = kept + save,
      lost' = lost + amount - save,
      parsed' = parsed + amount,
      stopped' = (stopped or amount > room)
    }
  }
  val Bounded = kept >= 0 and kept <= 4
  val Accounted = parsed == kept + lost
  val Truncated = stopped == (lost > 0)
}
