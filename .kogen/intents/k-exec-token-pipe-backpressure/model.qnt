module token_transport {
 var phase: str
 var transport: bool
 var child: bool
 val CleanReturn = phase == "done" implies (not(transport) and not(child))
 val Owned = child implies transport
 action init = all { phase' = "new", transport' = false, child' = false }
 action prepare = all { phase == "new", phase' = "ready", transport' = true, child' = false }
 action start = all { phase == "ready", phase' = "running", transport' = true, child' = true }
 action finish = all { phase != "done", phase' = "done", transport' = false, child' = false }
 action stay = all { phase == "done", phase' = phase, transport' = transport, child' = child }
 action step = any { prepare, start, finish, stay }
}
