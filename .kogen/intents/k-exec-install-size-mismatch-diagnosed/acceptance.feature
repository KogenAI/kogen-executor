Feature: Report a wrong-sized runtime download by its sizes
  Scenario Outline: Install the pinned runtime from a local origin
    Then k-exec-install-size-mismatch-diagnosed: installing from a "<origin>" origin yields '<result>'
    Examples:
      | origin | result |
      | page | {"requests":1,"success":false,"reason":"executor/unavailable","detail":"the downloaded Claude Code 2.1.318 is shorter than its pinned size: received 1024 bytes, expected 4096; nothing was installed","installed":false,"runtimeDir":false,"partialCount":0} |
      | flipped | {"requests":1,"success":false,"reason":"executor/unavailable","detail":"the downloaded Claude Code 2.1.318 does not match its pinned SHA-256; nothing was installed","installed":false,"runtimeDir":false,"partialCount":0} |
      | announced | {"requests":1,"success":false,"reason":"executor/unavailable","detail":"cannot download Claude Code 2.1.318 from {source}: the response announces 1024 bytes, expected 4096; nothing was installed","installed":false,"runtimeDir":false,"partialCount":0,"closedBeforeBody":true} |
      | announced-longer | {"requests":1,"success":false,"reason":"executor/unavailable","detail":"cannot download Claude Code 2.1.318 from {source}: the response announces 1048576 bytes, expected 4096; nothing was installed","installed":false,"runtimeDir":false,"partialCount":0,"closedBeforeBody":true} |
      | chunked-short | {"requests":1,"success":false,"reason":"executor/unavailable","detail":"the downloaded Claude Code 2.1.318 is shorter than its pinned size: received 2048 bytes, expected 4096; nothing was installed","installed":false,"runtimeDir":false,"partialCount":0} |
      | longer | {"requests":1,"success":false,"reason":"executor/unavailable","detail":"the downloaded Claude Code 2.1.318 is longer than its pinned size: received 4097 bytes, expected 4096; nothing was installed","installed":false,"runtimeDir":false,"partialCount":0,"fileWithinBound":true} |
      | correct | {"requests":1,"success":true,"reason":"","detail":"","installed":true,"runtimeDir":true,"partialCount":0} |
