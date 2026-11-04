module model {
 var count: int
 var emitted: int
 action init = all { count' = 0, emitted' = 0 }
 action boundary = all { count' = count + 1, emitted' = emitted + 1 }
 action ignored = all { count' = count, emitted' = emitted }
 action nextRound = all { count' = 0, emitted' = 0 }
 action step = any { boundary, ignored, nextRound }
 val Accurate = count == emitted and count >= 0
}
