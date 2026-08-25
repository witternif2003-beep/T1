#!/usr/bin/env bash
# Thin wrapper — prefer: ./cli restart [scanner|stock|payout|all]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/cli" restart "${1:-scanner}"
