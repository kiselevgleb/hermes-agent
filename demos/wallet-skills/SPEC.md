# Hermes Skills Demo — Specification

A public, self-contained demo of an engineering AI agent built on
[Hermes Agent](https://github.com/NousResearch/hermes-agent) (MIT). The agent works on a small
demo service through a library of skills: first-pass PR review, incident analysis from logs,
verified QA handoff and issue creation.

The goal is to show **how** the agent is built (skills as specifications, tools, guardrails,
verification), not to reproduce any internal system. No code, hostnames or data from any
employer are used.

> This is the brief the demo was built from. Where the implementation deliberately differs
> (cursor pagination, extra ledger columns, the incident setup), the README and
> `docs/decisions.md` say how and why.

---

## 1. Repository layout

```
demos/wallet-skills/          # inside the Hermes Agent fork
├── README.md                 # what it is, architecture diagram, how to run, Hermes setup
├── SPEC.md                   # this file
├── docker-compose.yml        # postgres + wallet-service
├── docker/init-db.sql        # read-only role agent_ro
├── wallet-service/           # the demo target service (NestJS)
│   ├── src/                  # unit tests live next to the code (*.spec.ts)
│   ├── prisma/
│   ├── Dockerfile
│   └── package.json
├── skills/                   # agent skills (agentskills.io / SKILL.md format)
│   ├── review-pr/SKILL.md
│   ├── incident-analysis/SKILL.md
│   ├── qa-handoff/SKILL.md
│   └── issue-task/SKILL.md
├── scripts/
│   ├── seed.sh               # create test players / wallets
│   ├── load.sh / load.mjs    # bet traffic with unique externalIds, prints p50/p95
│   └── break.sh              # switch the incident on / restore
└── docs/
    ├── decisions.md          # trade-offs (see section 6)
    └── planted-bugs.md       # what each planted branch changes
```

Hermes runs from the fork (`./setup-hermes.sh`, `source ./activate`, `hermes setup`) and loads
the `skills/` folder through `skills.external_dirs`. Model: any provider Hermes supports
(OpenRouter / OpenAI-compatible endpoint).

---

## 2. Demo target: `wallet-service`

Small but realistic, so the skills have something meaningful to work on.

**Stack:** NestJS, TypeScript, PostgreSQL (Prisma or TypeORM), Docker, Jest, structured JSON
logs (pino) with `requestId`.

**Domain:** players, wallets, ledger transactions.

### Data model

```
players(id uuid pk, name text, created_at timestamptz)
wallets(id uuid pk, player_id uuid fk unique, balance bigint not null check (balance >= 0),
        version int not null default 0)
transactions(id uuid pk, wallet_id uuid fk, external_id text not null,
             type text check (type in ('deposit','bet','win','rollback')),
             amount bigint not null, created_at timestamptz,
             unique (wallet_id, external_id))           -- idempotency
```

Amounts in minor units (cents). Ledger is append-only.

### API (OpenAPI via @nestjs/swagger, served at `/api`)

| Method | Path | Purpose |
|---|---|---|
| POST | /players | create player + wallet |
| GET | /players/:id/wallet | balance |
| POST | /wallets/:id/deposit | `{ externalId, amount }` |
| POST | /wallets/:id/bet | `{ externalId, amount }` |
| POST | /wallets/:id/win | `{ externalId, amount, betExternalId }` |
| POST | /wallets/:id/rollback | `{ externalId, originalExternalId }` |
| GET | /players?limit=&cursor= | list players with balances (keyset; the N+1 PR switches it to `page`) |
| GET | /health, /version | liveness; `/version` returns the git commit baked into the image |

Rules: every money operation runs in one DB transaction with `SELECT ... FOR UPDATE` on the
wallet; a repeated `externalId` returns the original result without changing the balance.

### Planted problems (each on its own git branch / PR)

1. **`pr/n-plus-one`** — `GET /players` loads wallets in a loop (N+1) and uses OFFSET
   pagination. Target for `review-pr`.
2. **`pr/missing-idempotency`** — `win` handler drops the unique check, so a replayed
   callback credits twice. Target for `review-pr` and `qa-handoff`.
3. **`break.sh` incident** — enables a slow query path (missing index on
   `transactions(wallet_id, created_at)` for a wallet with a long history) + a connection-pool
   limit; under `load.sh` latency spikes and requests time out. Target for `incident-analysis`.
4. **Fix PR `fix/idempotent-win`** — restores idempotency. Target for `qa-handoff`.

### Logging

JSON lines with `level, time, requestId, route, durationMs, walletId, externalId, err`.
Logs go to stdout; `docker compose logs wallet-service` is the agent's log source.

---

## 3. Tools the agent may use

Keep the tool surface small and explicit.

| Tool | Access | Used by |
|---|---|---|
| `gh` CLI (GitHub) | read PRs/diffs, post review comments, create issues, comment | review-pr, issue-task, qa-handoff |
| `git` | read-only on the repo (log, diff, merge-base) | all |
| `docker` / `docker compose` | `ps`, `logs`, `exec` (read-only commands), `inspect` | incident-analysis, qa-handoff |
| `curl` | HTTP to `localhost` only | qa-handoff, incident-analysis |
| `psql` | read-only role (`agent_ro`) | incident-analysis |

**Guardrails (state them in every skill):**
- never push, merge, or change infrastructure;
- DB access is read-only via a dedicated role;
- HTTP only to `localhost`;
- post to GitHub only when the skill says so, and never without having run the checks.

---

## 4. Skills (summary)

| Skill | Trigger | Output |
|---|---|---|
| `review-pr` | "review PR #N" | GitHub review with inline comments, grouped by severity |
| `incident-analysis` | "latency is up / errors on X" | root-cause hypothesis with evidence and next steps |
| `qa-handoff` | "write QA steps for #N" / "can this go to QA?" | verified test instruction as an issue comment, or a stop with the reason |
| `issue-task` | "create a task for …" | GitHub issue with context, acceptance criteria, scope |

Full text in `skills/*/SKILL.md`.

---

## 5. Demo script (for the 10-minute video)

1. **0:00–1:00 — Problem.** First-pass review, incident triage and QA instructions are
   repetitive, and the expensive mistakes are quiet ones: a test step written against code that
   is not deployed, a cause guessed instead of measured.
2. **1:00–3:00 — Architecture.** Diagram: Hermes → skills (specifications) → tools →
   guardrails. Why skills: repeatable, reviewable, versioned like code.
3. **3:00–4:30 — `review-pr` on `pr/n-plus-one`.** Agent finds N+1 + OFFSET pagination,
   suggests a join/`include` and keyset pagination.
4. **4:30–6:00 — `incident-analysis`.** Run `break.sh` + `load.sh`; ask "p95 latency on
   /bet is up". Agent reads logs, correlates slow requests, runs `EXPLAIN` via the read-only
   role, points to the missing index and pool saturation.
5. **6:00–8:00 — `qa-handoff` on `fix/idempotent-win`.** Agent first checks `/version` and
   greps the built code in the container; then runs the cases with curl (fresh player,
   deposit, bet, win, replay the same win → balance unchanged) and posts the instruction
   with expected values and "with the bug it was …".
   Bonus: run it before deploying the fix → agent **refuses** and explains why.
6. **8:00–9:00 — Trade-offs.** Where the agent is not trusted (writes, merges), why every
   number must come from a run, how prompts became specs.
7. **9:00–10:00 — Results.** Only what this demo measured: the incident numbers from the
   README table and how long each skill took on camera. Experience from earlier work is
   presented as experience, without figures that cannot be shown.

---

## 6. Decisions & trade-offs (`docs/decisions.md`)

- **Skills as specifications, not prompts.** Each skill states its goal, inputs, steps,
  stop conditions and output format. They are reviewed in PRs like code.
- **Verify before publishing.** The QA skill does not trust "merged" or "tagged"; it checks
  what actually runs (`/version`, grep in the container).
- **Numbers come from runs.** Expected values in QA instructions are copied from real
  responses, never inferred from reading code.
- **Least privilege.** Read-only DB role, localhost-only HTTP, no write access to git.
- **Human in the loop.** The agent comments and proposes; humans merge and deploy.
- **Small tool surface.** Fewer tools → fewer failure modes and easier review of what
  the agent did.

---

## 7. Build order (2–3 evenings)

1. `wallet-service` + docker-compose + seed/load scripts, tests green (evening 1).
2. Planted-bug branches + fix branch + `break.sh` (evening 1–2).
3. Install Hermes, connect a model, add the four skills, iterate on wording until the demo
   runs reliably (evening 2–3).
4. README with diagram + `decisions.md`, record the video (evening 3–4).

Use Claude Code / Cursor for the service code; write the skills yourself — they are the
part reviewers will read most closely.
