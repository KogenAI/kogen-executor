module stall {
 var phase: str
 var locked: bool
 var partial: bool
 var waiting: bool
 var notices: int
 action init = all { phase' = "idle", locked' = false, partial' = false, waiting' = false, notices' = 0 }
 action start = all { phase == "idle", phase' = "downloading", locked' = true, partial' = true, waiting' = waiting, notices' = notices }
 action wait = all { locked, not(waiting), notices == 0, phase' = phase, locked' = locked, partial' = partial, waiting' = true, notices' = notices + 1 }
 action progress = all { phase == "downloading", phase' = phase, locked' = locked, partial' = partial, waiting' = waiting, notices' = notices }
 action finish = all { phase == "downloading", phase' = "done", locked' = false, partial' = false, waiting' = waiting, notices' = notices }
 action abort = all { phase == "downloading", phase' = "failed", locked' = false, partial' = false, waiting' = waiting, notices' = notices }
 action retry = all { phase == "failed", waiting, phase' = "downloading", locked' = true, partial' = true, waiting' = false, notices' = notices }
 action rest = all { phase == "done" or phase == "failed", phase' = phase, locked' = locked, partial' = partial, waiting' = waiting, notices' = notices }
 action step = any { start, wait, progress, finish, abort, retry, rest }
 val Cleanup = (phase == "failed" or phase == "done") implies (not(locked) and not(partial))
 val Notice = notices <= 1
}
