#!/usr/bin/env bash
# Monitor agentdns-steward systemd timer, recent execution status, and proposals pending past window.
set -euo pipefail

STATE_DIR="${1:-/var/lib/agentdns-steward}"
MAX_WINDOW_SECONDS="${2:-133200}" # 36h + 1h grace

# 1. Check timer active
if ! systemctl is-active --quiet agentdns-steward.timer; then
    echo "ALERT: agentdns-steward.timer is inactive!" >&2
    exit 1
fi

# 2. Check last service run status
LAST_RESULT="$(systemctl show agentdns-steward.service -p ExecMainStatus --value)"
if [ "$LAST_RESULT" != "0" ] && [ "$LAST_RESULT" != "" ]; then
    echo "ALERT: agentdns-steward.service last exit status: $LAST_RESULT" >&2
    exit 2
fi

# 3. Check open proposals in state exceeding window without resolution
STATE_FILE="$STATE_DIR/steward-state.json"
if [ -f "$STATE_FILE" ]; then
    python3 - <<EOF
import json, sys, time

try:
    with open("$STATE_FILE") as f:
        state = json.load(f)
except Exception as e:
    print(f"WARN: could not read state file: {e}", file=sys.stderr)
    sys.exit(0)

now = time.time()
seen = state.get("seen", {})
voted = state.get("voted", {})
settled = set(state.get("settled", []))

stuck = []
for pid, first_seen in seen.items():
    if pid not in voted and pid not in settled:
        age = now - first_seen
        if age > float("$MAX_WINDOW_SECONDS"):
            stuck.append((pid, age))

if stuck:
    for pid, age in stuck:
        print(f"ALERT: proposal {pid} open for {int(age)}s without vote/settle past window!", file=sys.stderr)
    sys.exit(3)
EOF
fi

echo "OK: agentdns-steward timer active, last run ok, no proposals stuck past window"
