#!/bin/sh
# Turn the latency incident on or off.
#
# on:      give one wallet a long ledger history, drop transactions_wallet_id_created_at_idx,
#          restart wallet-service with a pool of 2 connections.
#          The pool timeout drops to 2 s, so a long queue for a connection becomes 500s.
# restore: put the index back and restart with a pool of 10 and a 10 s timeout. History stays.
#
# Without the (wallet_id, created_at) index, the hourly-bet sum on /bet can still use
# transactions_wallet_external_id_unique, whose leading column is wallet_id. That index finds
# the wallet but not the time window, so every bet reads the wallet's whole history.
# That is why the history goes into one wallet, and why scripts/load.sh bets on that wallet.
set -eu
cd "$(dirname "$0")/.."

mode="${1:-on}"
HISTORY_ROWS="${HISTORY_ROWS:-1000000}"
BASE="${BASE_URL:-http://localhost:3000}"
WALLET_FILE="scripts/.incident-wallet"

case "$HISTORY_ROWS" in
  ''|*[!0-9]*) echo "HISTORY_ROWS must be an integer" >&2; exit 1 ;;
esac

wait_healthy() {
  i=0
  until curl -sf "$BASE/health" >/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 90 ]; then
      echo "wallet-service did not become healthy" >&2
      exit 1
    fi
    sleep 1
  done
}

psql_admin() {
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U wallet -d wallet "$@"
}

if [ "$mode" = "restore" ]; then
  psql_admin <<'SQL'
CREATE INDEX IF NOT EXISTS transactions_wallet_id_created_at_idx ON transactions (wallet_id, created_at);
ANALYZE transactions;
SQL
  DB_POOL_MAX=10 DB_POOL_TIMEOUT=10 docker compose up -d --force-recreate --no-deps wallet-service
  wait_healthy
  echo "Restored the index, DB_POOL_MAX=10 and DB_POOL_TIMEOUT=10. The history rows were left in place."
  exit 0
fi

if [ "$mode" != "on" ]; then
  echo "usage: scripts/break.sh [on|restore]" >&2
  exit 1
fi

wait_healthy

# The incident wallet is created through the API, like any other wallet.
wallet_id=""
if [ -f "$WALLET_FILE" ]; then
  wallet_id=$(cat "$WALLET_FILE")
  if ! psql_admin -tAc "SELECT 1 FROM wallets WHERE id = '$wallet_id'" | grep -q 1; then
    wallet_id=""
  fi
fi
if [ -z "$wallet_id" ]; then
  created=$(curl -sf -H 'content-type: application/json' -d '{"name":"incident-player"}' "$BASE/players")
  wallet_id=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).wallet.id)' "$created")
  echo "$wallet_id" > "$WALLET_FILE"
fi

# Old bets dated 2020: outside the one-hour window, so they never count toward the limit.
# They are table volume for the query plan, not a consistent ledger.
psql_admin -v wallet_id="$wallet_id" -v history_rows="$HISTORY_ROWS" <<'SQL'
SET statement_timeout = '300s';
INSERT INTO transactions (wallet_id, external_id, type, amount, balance_after, created_at)
SELECT CAST(:'wallet_id' AS uuid),
       'history-' || g::text,
       'bet',
       1,
       0,
       TIMESTAMPTZ '2020-01-01 00:00:00+00' + g * INTERVAL '1 second'
FROM generate_series(1, :history_rows) AS g
ON CONFLICT (wallet_id, external_id) DO NOTHING;
ANALYZE transactions;
SQL

psql_admin -c "DROP INDEX IF EXISTS transactions_wallet_id_created_at_idx;"

DB_POOL_MAX=2 DB_POOL_TIMEOUT=2 docker compose up -d --force-recreate --no-deps wallet-service
wait_healthy

echo "Incident mode: index dropped, DB_POOL_MAX=2, DB_POOL_TIMEOUT=2, wallet $wallet_id has $HISTORY_ROWS history rows."
echo "Run CONCURRENCY=80 REQUESTS=400 sh scripts/load.sh, then scripts/break.sh restore when you are done."
