#!/bin/bash

# Solana Payout Drop Console - Restart Script
# Restarts the payout application service

set -e

SERVICE_NAME="t1-payout-app-root"

echo "Restarting Solana Payout Drop Console..."

# Restart the service
sudo systemctl restart "$SERVICE_NAME"

# Check if service restarted successfully
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "✓ Payout service restarted successfully"
    echo "Status:"
    sudo systemctl status "$SERVICE_NAME" --no-pager
else
    echo "✗ Failed to restart payout service"
    exit 1
fi
