# Hermes skills demo: wallet-service

Four [agent skills](skills) for [Hermes Agent](../../README.md) and the small service they work
on. The skills do the routine parts of engineering work that are easy to get subtly wrong:

**Demo (2 min):** `review-pr` on [PR #2](https://github.com/kiselevgleb/hermes-agent/pull/2). Recorded right after the run; the terminal shows the full session.
https://github.com/user-attachments/assets/11fd1130-c599-43be-8161-45701b7ef58c

| Skill | Ask | Result |
|---|---|---|
| [`review-pr`](skills/review-pr/SKILL.md) | "review PR #12" | one GitHub review, inline comments grouped by severity |
| [`incident-analysis`](skills/incident-analysis/SKILL.md) | "p95 on /bet is up" | cause, evidence with numbers, next steps |
| [`qa-handoff`](skills/qa-handoff/SKILL.md) | "can #14 go to QA?" | a QA instruction with values from real responses, or a stop with the reason |
| [`issue-task`](skills/issue-task/SKILL.md) | "file a bug for this" | a GitHub issue with reproduction and acceptance criteria |

The skills are specifications: goal, guardrails, steps with the exact commands, stop conditions,
output format. They are versioned and reviewed like code. [SPEC.md](SPEC.md) is the original
brief and the video script.

## Architecture

```mermaid
flowchart LR
  E[Engineer] -->|"/review-pr 12"| H[Hermes Agent]
  H --> RP[review-pr]
  H --> IA[incident-analysis]
  H --> QA[qa-handoff]
  H --> IT[issue-task]

  RP --> GH[(GitHub<br/>gh: PRs, reviews)]
  RP --> GIT[git<br/>read-only]
  IA --> LOGS[docker compose logs<br/>JSON lines]
  IA --> DB[(Postgres<br/>agent_ro, SELECT only)]
  IA --> HTTP[curl<br/>localhost only]
  QA --> GH
  QA --> GIT
  QA --> HTTP
  QA --> DIST[docker compose exec<br/>grep built code]
  IT --> GH
  IT --> HTTP

  HTTP --> SVC[wallet-service<br/>NestJS]
  DIST --> SVC
  LOGS --> SVC
  SVC --> DB
```

## Principles

- **Verify before publishing.** `qa-handoff` does not trust "merged". It checks which commit is
  serving (`GET /version`, `git merge-base --is-ancestor`) and greps the built code in the
  container. If the fix is not running, it stops and says what is missing.
- **No numbers without a run.** Expected balances, latencies and error counts come from responses
  and commands executed in the same session. A "with the bug" value needs a source, or it is
  written as "not measured".
- **Read-only where it matters.** Database access is the `agent_ro` role (`SELECT`,
  `pg_read_all_stats`). HTTP goes to localhost only. No push, no merge, no restarts.
- **The agent comments; people decide.** `review-pr` posts `COMMENT` reviews only. Each skill
  publishes only when the request asks for it, otherwise it shows a draft.
- **Guardrails are enforced, not only written.** The token and the database role make the
  important limits hard; Hermes deny rules catch the rest. See [Hermes setup](#hermes-setup).

Trade-offs are in [docs/decisions.md](docs/decisions.md).

## Run the service

From this directory. Postgres is on host port **5433**, the API on **3000**. The passwords below
are for this local stack only.

```sh
GIT_COMMIT=$(git rev-parse HEAD) docker compose up --build -d
sh scripts/seed.sh
```

`GIT_COMMIT` is baked into the image and returned by `/version`. Without it the service reports
`dev`, and `qa-handoff` will refuse to continue, by design.

- Swagger UI: http://localhost:3000/api
- Health / commit: http://localhost:3000/health, http://localhost:3000/version
- Logs: `docker compose logs -f wallet-service`
- Read-only SQL: `docker compose exec postgres psql -U agent_ro -d wallet`
  (or `psql postgresql://agent_ro:agent_ro@localhost:5433/wallet` from the host)
- Reset: `docker compose down -v`

Unit tests (no database needed):

```sh
cd wallet-service && npm install && npm test
```

## Money rules

Amounts are integer cents. A player is created together with a wallet whose balance is 0.

Every deposit, bet, win and rollback runs in one database transaction and locks the wallet with
`SELECT ... FOR UPDATE`. The same `externalId` on a wallet returns the stored result and does not
move the balance; `balanceAfter` in that response is the balance right after the original
operation. The current balance is `GET /players/:id/wallet`.

| Call | Effect |
|---|---|
| `POST /wallets/:id/deposit` | add `amount` |
| `POST /wallets/:id/bet` | subtract `amount`; 409 when the balance or the hourly cap would be exceeded |
| `POST /wallets/:id/win` | add `amount`; `betExternalId` must already be a bet on this wallet |
| `POST /wallets/:id/rollback` | reverse one deposit, bet or win; a second rollback of the same original is 409 |

`GET /players?limit=&cursor=` returns players and wallets from one join, ordered by
`(created_at, id)`. Pass `nextCursor` back as `cursor`.

Two columns are added to the data model in the brief, because the rules need them:

- `transactions.balance_after` — the value returned on a replay;
- `transactions.reference_external_id` — the bet a win settles, or the original a rollback
  reverses. A partial unique index allows one rollback per original.

## Logs

Each request is one JSON line on stdout (pino): `level`, `time`, `requestId`, `route`,
`durationMs`, `statusCode`, and when present `walletId`, `externalId`, `err`. Pass
`x-request-id` to correlate; it is echoed back in the response header.

## Planted problems

| Where | Problem | Skill |
|---|---|---|
| PR `pr/n-plus-one` | wallet loaded per player in a loop, `OFFSET` pagination | `review-pr` |
| PR `pr/missing-idempotency` (merged) | a replayed win credits the wallet twice | `review-pr`, `issue-task` |
| PR `fix/idempotent-win` | restores idempotency; migration handles duplicates | `qa-handoff` |
| `scripts/break.sh` | missing index + small connection pool | `incident-analysis` |

What each branch changes and why is in [docs/planted-bugs.md](docs/planted-bugs.md).

## Incident

`/bet` sums the wallet's bets for the last hour, using `transactions_wallet_id_created_at_idx`.

```sh
sh scripts/break.sh                              # history wallet, drop the index, pool 2 / 2 s
CONCURRENCY=80 REQUESTS=400 sh scripts/load.sh   # latency up, some 500s
sh scripts/break.sh restore                      # index back, pool 10 / 10 s
CONCURRENCY=80 REQUESTS=400 sh scripts/load.sh   # same wallet, same load
```

Measured on 2026-11-17, MacBook Pro, Docker Desktop, one run each, same wallet with 1,000,000
history rows. Your numbers will differ; the shape should not.

| State | Requests | Failures | p50 | p95 |
|---|---|---|---|---|
| broken (no index, pool 2 / 2 s) | 400 | 77 (pool timeout) | 2025 ms | 2074 ms |
| restored (index, pool 10 / 10 s) | 400 | 0 | 169 ms | 356 ms |

In the broken state the hourly sum is a sequential scan over about a million rows
(`EXPLAIN ANALYZE`: ~72 ms per query), and the 500s carry
`Timed out fetching a new connection from the connection pool` in `err.message`.

## Hermes setup

Run Hermes from this fork, not from the upstream installer. From the repository root:

```sh
./setup-hermes.sh
source ./activate
hermes setup          # model provider and key
```

`~/.hermes/config.yaml`, the parts this demo relies on:

```yaml
skills:
  external_dirs:
    - ~/path/to/hermes-agent/demos/wallet-skills/skills
  creation_nudge_interval: 0        # no self-created skills during the demo

platform_toolsets:
  cli: [terminal, file, skills, todo]   # no web, browser or messaging tools

approvals:
  mode: manual
  deny:
    - 'git push*'
    - 'git merge*'
    - 'git commit*'
    - 'gh pr merge*'
    - '*gh api*merge*'
    - '*--approve*'
    - '*--request-changes*'
    - '*REQUEST_CHANGES*'
    - '*"APPROVE"*'
    - 'docker compose up*'
    - 'docker compose down*'
    - 'docker compose restart*'
    - 'docker compose stop*'
    - '*break.sh*'
    - '*-U wallet *'
    - '*wallet:wallet@*'
```

Hermes deny rules match command text; they are a policy, not a sandbox. The hard limits are
outside the agent:

- **GitHub:** give Hermes a fine-grained token for this repository only, with *Issues* and
  *Pull requests* read/write and *Contents* read-only. It cannot push, whatever the command.
- **Database:** `agent_ro` cannot write, whatever the SQL.
- **Skills:** directories in `external_dirs` are still writable by `skill_manage`. Make them
  read-only for the demo (`chmod -R a-w skills`); any change also shows up in `git diff`.

Run a skill explicitly, so the bundled `github` skill does not pick up the request:

```sh
cd demos/wallet-skills
hermes
> /review-pr review PR #12 and post the review
```
