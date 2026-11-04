module cost {
 var base: int
 var gap: bool
 var known: bool
 var cost: int
 var valid: bool
 action init = all { base' = 0, gap' = false, known' = false, cost' = 0, valid' = true }
 action step = nondet total = oneOf(Set(-1, 10, 20, 35, 40, 50, 55)) { nondet failed = oneOf(Set(false, true)) { all {
 known' = (total >= 0 and not(gap) and total >= base),
 cost' = if (total >= 0 and not(gap) and total >= base) total - base else 0,
 valid' = true,
 base' = if (failed or total < 0) base else total,
 gap' = if (failed) gap else total < 0
 } } }
 val Safe = valid and (not(known) or cost >= 0)
}
