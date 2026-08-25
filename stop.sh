#!/usr/bin/env bash
# Thin wrapper — prefer: ./cli stop [scanner|stock|payout|all]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/cli" stop "${1:-scanner}"
