#!/usr/bin/env bash
set -euo pipefail
DIR="$HOME/t1-payout-app-root"
PORT="${1:-8091}"
"$DIR/stop.sh" "$PORT" || true
sleep 1
"$DIR/start.sh" "$PORT"
