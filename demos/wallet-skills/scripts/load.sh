#!/bin/sh
# Generate bet traffic. REQUESTS, CONCURRENCY, BET_AMOUNT, BASE_URL and WALLET_ID are optional.
# After scripts/break.sh, bets go to the incident wallet unless WALLET_ID is set.
set -eu
dir="$(dirname "$0")"
if [ -z "${WALLET_ID:-}" ] && [ -f "$dir/.incident-wallet" ]; then
  WALLET_ID=$(cat "$dir/.incident-wallet")
  export WALLET_ID
fi
exec node "$dir/load.mjs"
