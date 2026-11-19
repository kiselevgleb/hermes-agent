#!/bin/sh
# Create three players and deposit 100.00 onto the first wallet.
set -eu
BASE="${BASE_URL:-http://localhost:3000}"

i=0
until curl -sf "$BASE/health" >/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "wallet-service did not become healthy at $BASE" >&2
    exit 1
  fi
  sleep 1
done

post() {
  curl -sf -H 'content-type: application/json' -H "x-request-id: seed-$1" -d "$2" "$BASE$3"
}

field() {
  node -e '
    const path = process.argv[1].split(".");
    let value = JSON.parse(process.argv[2]);
    for (const key of path) value = value[key];
    if (value === undefined || value === null) process.exit(1);
    process.stdout.write(String(value));
  ' "$1" "$2"
}

alice=$(post alice '{"name":"alice"}' /players)
alice_wallet=$(field wallet.id "$alice")
deposit=$(post alice-deposit '{"externalId":"seed-alice-deposit","amount":10000}' "/wallets/${alice_wallet}/deposit")
bob=$(post bob '{"name":"bob"}' /players)
cara=$(post cara '{"name":"cara"}' /players)

alice_id=$(field id "$alice")
alice_balance=$(field balanceAfter "$deposit")
bob_id=$(field id "$bob")
bob_wallet=$(field wallet.id "$bob")
cara_id=$(field id "$cara")
cara_wallet=$(field wallet.id "$cara")

echo "alice player=${alice_id} wallet=${alice_wallet} balanceAfter=${alice_balance}"
echo "bob   player=${bob_id} wallet=${bob_wallet}"
echo "cara  player=${cara_id} wallet=${cara_wallet}"
echo "list    ${BASE}/players?limit=20"
echo "swagger ${BASE}/api"
