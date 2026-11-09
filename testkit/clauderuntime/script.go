package clauderuntime

import (
	"strings"

	"github.com/KogenAI/kogen-executor/executor/claudecode"
)

// script is the POSIX sh fake `claude`. It answers --version and `auth status --json`; any
// other call is round n (n counts calls in <State>/calls): it saves its stdin as
// <State>/prompt-<n>.bin and its arguments, one per line, as <State>/args-<n>.txt, and, when
// file descriptor 3 is open, the bytes read from it as <State>/token-<n>.bin; it prints a system/init line and then <State>/round-<n>.jsonl with
// SessionID replaced by the session id, and exits.
func script(o Options) string {
	return `#!/bin/sh
STATE=` + shQuote(o.State) + `
CWD=` + shQuote(o.Checkout) + `
KEYSRC=` + shQuote(o.APIKeySource) + `
if [ "$1" = "--version" ]; then
  echo "` + claudecode.Version + ` (Claude Code)"
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '` + AuthStatusJSON + `'
  exit 0
fi
n=0
if [ -f "$STATE/calls" ]; then n=$(cat "$STATE/calls"); fi
n=$((n+1))
echo "$n" > "$STATE/calls"
printf '%s\n' "$@" > "$STATE/args-$n.txt"
cat > "$STATE/prompt-$n.bin"
if ( : <&3 ) 2>/dev/null; then cat <&3 > "$STATE/token-$n.bin"; fi
sid=
prev=
for a in "$@"; do
  case "$prev" in
    --session-id|--resume) sid=$a ;;
  esac
  prev=$a
done
printf '{"type":"system","subtype":"init","cwd":"%s","session_id":"%s","mcp_servers":[],"permissionMode":"acceptEdits","apiKeySource":"%s","claude_code_version":"` + claudecode.Version + `","model":"claude-sonnet-5-5"}\n' "$CWD" "$sid" "$KEYSRC"
if [ -f "$STATE/round-$n.jsonl" ]; then sed "s/` + SessionID + `/$sid/g" "$STATE/round-$n.jsonl"; fi
exit 0
`
}

func shQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }
