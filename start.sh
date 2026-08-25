#!/usr/bin/env bash
# Thin wrapper — prefer: ./cli start [scanner|stock|payout|all]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/cli" start "${1:-scanner}"
