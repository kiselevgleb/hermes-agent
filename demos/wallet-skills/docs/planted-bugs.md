# Planted bugs

`main` is the correct service. Each planted problem is a branch with a pull request, so the skills work on real diffs.

## Branch order

The QA story needs the bug to be "in production" before the fix exists, so the order matters:

1. `pr/n-plus-one` from `main` → PR into `main`. **Not merged.** Target for `review-pr`.
2. `pr/missing-idempotency` from `main` → PR into `main`. Target for `review-pr`, then **merged**: the bug ships.
3. An issue, "wallet: replayed win credits the wallet twice", with a reproduction. Target for `issue-task` (or written by it).
4. `fix/idempotent-win` from the new `main` → PR into `main` that closes the issue. **Not merged.** Target for `qa-handoff`.

## `pr/n-plus-one`

Replace `PlayersService.list` so it pages with `OFFSET` and loads each wallet separately:

```typescript
async list(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const players = await this.prisma.player.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    skip,
    take: limit,
  });
  const items = [];
  for (const player of players) {
    const wallet = await this.prisma.wallet.findUnique({ where: { playerId: player.id } });
    if (!wallet) continue;
    items.push({
      id: player.id,
      name: player.name,
      createdAt: player.createdAt.toISOString(),
      walletId: wallet.id,
      balance: money(wallet.balance),
    });
  }
  return { items, page, limit };
}
```

Point `GET /players` at `page` and `limit` instead of `cursor`. `review-pr` should flag the loop and the offset, and suggest the join and the keyset query that are on `main` (`src/wallets/sql.ts`).

## `pr/missing-idempotency`

A replayed win has to credit the wallet twice. Three things guard against that:

| Guard | Where |
|---|---|
| the `existing` lookup | `WalletsService.apply` |
| the early return on `existing` | `applyOperation` in `ledger.ts` |
| `transactions_wallet_external_id_unique` | database |

`apply` loads the referenced bet only when `existing` is null. Removing only the early return in `applyOperation` therefore turns a replay into `422 bet not found`, not a double credit. Dropping only the constraint changes nothing, because the lookup still answers the replay. The branch removes the lookup for wins and the constraint.

1. In `src/wallets/wallets.service.ts`, skip the lookup for wins. Make it look like an optimisation, the way it would in a real PR:

   ```typescript
   // Wins arrive once per round from the provider; skip the extra lookup.
   const existing = input.type === 'win' ? null : await lock.findTx(input.externalId);
   ```

2. Add a migration, for example `prisma/migrations/20261118090000_drop_tx_unique/migration.sql`:

   ```sql
   ALTER TABLE "transactions" DROP CONSTRAINT "transactions_wallet_external_id_unique";
   ```

   Leave `@@unique` in `schema.prisma`: `findUnique` on `walletId_externalId` needs it to compile. `prisma migrate deploy` does not check drift, so the service starts.

The early return in `applyOperation` and `transactions_one_rollback` stay; with `existing` always null for wins, they are not on the path.

Check after deploying the branch: fresh player, deposit, bet, win, the same win again → the balance grows twice and the second response has `idempotentReplay: false`.

## `fix/idempotent-win`

1. Restore the lookup in `apply`:

   ```typescript
   const existing = await lock.findTx(input.externalId);
   ```

2. Add the constraint back, for example `prisma/migrations/20261119090000_restore_tx_unique/migration.sql`. While the bug was live, replays wrote duplicate rows, and `ADD CONSTRAINT` would fail on them, which would stop the container at `prisma migrate deploy`. So the migration first renames the later copies. The rows stay, because the ledger is append-only and the money was credited. Correcting those balances is separate work, and a good `issue-task` follow-up.

   ```sql
   UPDATE "transactions" AS t
   SET "external_id" = t."external_id" || '#dup-' || d.rn
   FROM (
     SELECT "id",
            row_number() OVER (PARTITION BY "wallet_id", "external_id" ORDER BY "created_at", "id") - 1 AS rn
     FROM "transactions"
   ) AS d
   WHERE t."id" = d."id" AND d.rn > 0;

   ALTER TABLE "transactions"
     ADD CONSTRAINT "transactions_wallet_external_id_unique" UNIQUE ("wallet_id", "external_id");
   ```

   This SQL was checked against the demo database inside a rolled-back transaction with two duplicate rows.

3. Add a unit test in `src/wallets/wallets.service.spec.ts`: a replayed win returns the stored result and does not call `commitNew`.

`qa-handoff` runs against this branch only after `GET /version` and a grep of the built file show that this code is serving. Before that deploy, the skill is supposed to stop.

## Incident, not a branch

`scripts/break.sh`:

- creates one wallet and gives it 1,000,000 bets dated 2020 (outside the hourly window, so they never count toward the limit);
- drops `transactions_wallet_id_created_at_idx`;
- restarts the service with `DB_POOL_MAX=2` and `DB_POOL_TIMEOUT=2`.

`scripts/load.sh` then bets on that wallet. The hourly sum can no longer narrow by time and reads the whole table. Every bet holds one of two connections for that long, the rest queue, and some give up after 2 s with a Prisma pool timeout.

`scripts/break.sh restore` puts the index back and the pool to 10 / 10 s. History rows stay. Measured numbers are in the [README](../README.md#incident).
