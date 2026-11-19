# Decisions

## Skills are specifications

Each skill states its goal, inputs, steps, stop conditions, and output format. They are reviewed like code. The wording is the product: a vague skill produces a vague review.

## Verify before publishing

The QA skill does not trust "merged" or "tagged". It checks the process that is actually serving (`GET /version`, then a grep of the built file in the container) and runs the cases. Expected numbers are copied from those responses.

## Numbers come from runs

A balance in a QA comment is a value the service returned. Reading the handler and adding the amounts up is not good enough, including when the arithmetic looks obvious.

## Least privilege

`agent_ro` can read tables and statistics and cannot write. HTTP from the agent stays on localhost. The skills do not push, merge, or change infrastructure. The demo database password is for the local Compose stack, not a stand-in for a production secret.

## Human in the loop

The agent comments and proposes. A person merges and deploys. `review-pr` posts `--comment` only.

## Small tool surface

`gh`, read-only `git`, `docker compose`, `curl` to localhost, and `psql` as `agent_ro`. Fewer tools means fewer ways for a run to wander.

## Keyset pagination on the main branch

`GET /players` is one join, ordered by `(created_at, id)`, and the next page is a cursor. The planted review target is the branch that replaces this with a per-player query and `OFFSET`. That diff is described in [planted-bugs.md](planted-bugs.md).

## Idempotency is stored, not recomputed

A repeated `externalId` returns the original transaction, including `balance_after`. The wallet row is not updated. Returning the wallet's later balance would make the second response differ from the first, so a tester could not tell a replay from a new credit.

## One rollback per original

The spec's unique key stops a provider from applying the same callback twice. It does not stop a second rollback id from refunding the same bet. `transactions_one_rollback` is a partial unique index on `(wallet_id, reference_external_id)` for `type = 'rollback'`.

## The slow query is a real read

Every new bet sums that wallet's bets for the last hour and rejects the bet when `HOURLY_BET_LIMIT` would be exceeded. The default limit is high enough that the demo never trips it. The statement is there so `EXPLAIN` on an incident has a query that needs `transactions_wallet_id_created_at_idx`.

Dropping that index alone is not enough. `transactions_wallet_external_id_unique` also starts with `wallet_id`, so Postgres can still find a small wallet's rows quickly. The incident only shows up for a wallet with a long history, so `scripts/break.sh` gives one wallet a million old bets and `scripts/load.sh` bets on that wallet. A missing index on an empty or evenly spread table would not show up in latency.

The pool is shrunk to 2 with a 2 s timeout, so the slow query turns into a queue, and the queue turns into `500` lines with a Prisma pool-timeout message. That gives the agent two independent signals (slow plan, pool errors) that one hypothesis has to explain.

## The commit is baked into the image

`GIT_COMMIT` is a build argument only. If Compose also set it as a runtime variable, recreating the container without a rebuild (as `break.sh` does) would reset `/version` to `dev`, and `qa-handoff` would stop for the wrong reason.

## Agent guardrails are enforced, not only written

The skills say "read-only", and the environment makes it true where it can:

- `agent_ro` has `SELECT` and `pg_read_all_stats` and nothing else;
- the GitHub token given to Hermes is fine-grained, limited to this repository, with Issues and Pull requests write and Contents read, so it cannot push;
- Hermes runs with web tools off and command approval on, so `docker compose exec` with anything but a read needs a human.
