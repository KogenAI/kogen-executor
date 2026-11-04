module retry {
 var attempts: int
 var phase: str
 val bounded = attempts >= 0 and attempts <= 3
 val terminal = phase == "done" implies attempts > 0
 action init = all { attempts' = 0, phase' = "ready" }
 action step = any {
  all { phase == "ready", attempts < 3, attempts' = attempts + 1, phase' = "body" },
  all { phase == "body", attempts < 3, attempts' = attempts, phase' = "pause" },
  all { phase == "pause", attempts' = attempts, phase' = "ready" },
  all { phase == "body" or phase == "pause", attempts' = attempts, phase' = "done" },
  all { phase == "done", attempts' = attempts, phase' = phase }
 }
}
