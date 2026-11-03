module limit {
 var count: int
 var last: int
 action init = all { count' = 0, last' = 0 }
 action report = all { count' = count + 1, last' = 1 }
 action bare = all { count' = count + 1, last' = last }
 action nextRound = all { count' = 0, last' = 0 }
 action step = any { report, bare, nextRound }
 val Valid = count >= 0 and (last == 0 or count > 0)
}
