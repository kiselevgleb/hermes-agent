-- Wins are written once per provider round; the per-row uniqueness check on
-- (wallet_id, external_id) costs an index update on every insert.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_wallet_external_id_unique";
