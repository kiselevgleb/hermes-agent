#!/bin/sh
set -eu

POOL="${DB_POOL_MAX:-10}"
POOL_TIMEOUT="${DB_POOL_TIMEOUT:-10}"

add_param() {
  name="$1"
  value="$2"
  case "$DATABASE_URL" in
    *"${name}="*) ;;
    *\?*) DATABASE_URL="${DATABASE_URL}&${name}=${value}" ;;
    *) DATABASE_URL="${DATABASE_URL}?${name}=${value}" ;;
  esac
}

add_param connection_limit "$POOL"
add_param pool_timeout "$POOL_TIMEOUT"
export DATABASE_URL

echo "wallet-service starting commit=${GIT_COMMIT:-dev} db_pool_max=${POOL}" >&2

npx prisma migrate deploy

# agent_ro is created by docker/init-db.sql. Grant is a backstop if defaults did not apply.
printf '%s\n' 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_ro;' \
  | npx prisma db execute --schema prisma/schema.prisma --stdin \
  || echo "warning: could not grant agent_ro; incident queries need that role" >&2

exec node dist/main.js
