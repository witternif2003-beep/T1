#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$HOME/t1-payout-app-root"
PID_FILE="$APP_DIR/server.pid"
PORT="${1:-8091}"
PID=""
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
fi
if [[ -z "$PID" ]]; then
  PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n1 || true)"
fi
if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped PID $PID"
else
  echo "No running server found on port ${PORT}"
fi
rm -f "$PID_FILE"
