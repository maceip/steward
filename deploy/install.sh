#!/usr/bin/env bash
# Install or update the steward on a host that holds an agent member key.
# Run as root from a checkout: bash deploy/install.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install -d -m 0755 -o agenthost -g agenthost /opt/steward /opt/steward/src
rsync -a --delete --exclude .git "$HERE/" /opt/steward/src/
chown -R agenthost:agenthost /opt/steward/src
sudo -u agenthost bash -c 'cd /opt/steward && ([ -x venv/bin/python ] || python3 -m venv venv) && venv/bin/pip install -q cryptography "ccf>=6,<8" 2>&1 | grep -v notice || true'
sudo -u agenthost /opt/steward/venv/bin/python -c 'import ccf.cose, cryptography'
install -m 0644 "$HERE/deploy/agentdns-steward.service" /etc/systemd/system/agentdns-steward.service
install -m 0644 "$HERE/deploy/agentdns-steward.timer" /etc/systemd/system/agentdns-steward.timer
systemctl daemon-reload && systemctl enable --now agentdns-steward.timer
echo "steward installed from $(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo nogit); next run: $(systemctl show agentdns-steward.timer -p NextElapseUSecRealtime --value)"
