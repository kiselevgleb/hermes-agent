const PLAYER_LIST_SELECT = `
SELECT p.id::text AS id,
       p.name,
       p.created_at,
       w.id::text AS wallet_id,
       w.balance::text AS balance
FROM players p
INNER JOIN wallets w ON w.player_id = p.id
`;

/** One query for a page of players and their wallets. Keyset, not OFFSET. */
export const LIST_PLAYERS_SQL = `${PLAYER_LIST_SELECT}
ORDER BY p.created_at ASC, p.id ASC
LIMIT $1`;

export const LIST_PLAYERS_AFTER_SQL = `${PLAYER_LIST_SELECT}
WHERE (p.created_at, p.id) > (
  SELECT created_at, id FROM players WHERE id = CAST($1 AS uuid)
)
ORDER BY p.created_at ASC, p.id ASC
LIMIT $2`;

/** Row lock for a money operation. The parameter is bound by the caller. */
export const LOCK_WALLET_SQL = `
SELECT id::text AS id, balance, version
FROM wallets
WHERE id = CAST($1 AS uuid)
FOR UPDATE
`;

/**
 * Hourly bet volume for one wallet.
 * Uses transactions_wallet_id_created_at_idx. scripts/break.sh drops that index.
 */
export const RECENT_BETS_SQL = `
SELECT COALESCE(SUM(amount), 0)::text AS total
FROM transactions
WHERE wallet_id = CAST($1 AS uuid)
  AND type = 'bet'
  AND created_at > NOW() - INTERVAL '1 hour'
`;
