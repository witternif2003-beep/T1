#!/usr/bin/env bash
# Cursor-friendly restart for the payout console (no systemd/sudo).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/cli" restart payout
