module cache {
 var runtime: int
 var checked: int
 var allowed: bool
 action init = all { runtime' = 1, checked' = 0, allowed' = false }
 action step = any {
  all { runtime' = 2, checked' = checked, allowed' = false },
  all { runtime' = 0, checked' = checked, allowed' = false },
  all { runtime' = runtime, checked' = runtime, allowed' = runtime == 1 },
  all { runtime' = runtime, checked' = checked, allowed' = false }
 }
 val Safe = allowed implies (runtime == 1 and checked == runtime)
}
