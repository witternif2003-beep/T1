#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$HOME/t1-payout-app-root"
PORT="${1:-8091}"
LOG_FILE="$APP_DIR/server.log"
PID_FILE="$APP_DIR/server.pid"
mkdir -p "$APP_DIR"
EXISTING_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -n1 || true)"
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Already running on PID $(cat "$PID_FILE") at http://127.0.0.1:${PORT}/"
  exit 0
fi
if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
  echo "$EXISTING_PID" > "$PID_FILE"
  echo "Already running on PID $EXISTING_PID at http://127.0.0.1:${PORT}/"
  exit 0
fi
nohup python3 -m http.server "$PORT" --directory "$APP_DIR" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Started T1 payout app on http://127.0.0.1:${PORT}/"
