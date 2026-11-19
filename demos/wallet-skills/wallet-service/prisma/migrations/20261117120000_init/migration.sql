CREATE TABLE "players" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "player_id" UUID NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallets_balance_nonnegative" CHECK ("balance" >= 0)
);

CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "reference_external_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transactions_type_check" CHECK ("type" IN ('deposit', 'bet', 'win', 'rollback')),
    CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "transactions_wallet_external_id_unique" UNIQUE ("wallet_id", "external_id")
);

CREATE INDEX "players_created_at_id_idx" ON "players" ("created_at", "id");

CREATE UNIQUE INDEX "wallets_player_id_key" ON "wallets" ("player_id");

CREATE INDEX "transactions_wallet_id_created_at_idx" ON "transactions" ("wallet_id", "created_at");

-- One successful rollback per original external id. A second id must not refund again.
CREATE UNIQUE INDEX "transactions_one_rollback" ON "transactions" ("wallet_id", "reference_external_id") WHERE "type" = 'rollback';

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
