---
name: incident-analysis
description: Triage an incident in wallet-service from logs, container state and read-only database checks, and report a root-cause hypothesis with evidence. Use when someone reports errors, timeouts or rising latency ("p95 is up on /bet", "500s on deposit", "service is slow").
version: 1.1.0
license: MIT
metadata:
  hermes:
    tags: [incident, observability, postgres, wallet-service]
    related_skills: [issue-task]
---

# Incident analysis

Goal: in a few minutes, give the on-call engineer the most likely cause, the evidence for it and
the next step. You investigate and recommend; you do not fix.

## Guardrails

- Read only. Never restart, scale, recreate or exec a write into containers; never change config.
- Database: only the `agent_ro` role. Never connect as `wallet`.
- HTTP only to `localhost`.
- Every number in the report comes from a command you ran in this session.

## Steps

Run the commands from the directory that holds `docker-compose.yml`.

1. **Scope.** Which endpoint, since when, what symptom (errors, latency, wrong data)? If the
   report is vague, take the most specific reading and state it.
2. **State of the service.**
   ```sh
   docker compose ps                         # status, uptime: was it restarted recently?
   curl -s localhost:3000/health
   curl -s localhost:3000/version            # which commit is serving
   docker compose logs wallet-service | grep db_pool_max     # pool size at start
   docker compose exec -T wallet-service printenv DB_POOL_MAX DB_POOL_TIMEOUT
   ```
   A recreated container has no logs from before its start. If uptime is shorter than the
   incident, say that the window is partial.
3. **Logs.** Each request is one JSON line (`msg: "request"`). Startup lines are not JSON, so
   filter them out. Per route: count, 5xx count, p50, p95:
   ```sh
   docker compose logs --no-log-prefix --since 15m wallet-service | grep '^{' | jq -s '
     map(select(.msg == "request")) | group_by(.route) | map({
       route: .[0].route, n: length,
       e5xx: (map(select(.statusCode >= 500)) | length),
       p50: (map(.durationMs) | sort | .[((length * 0.5) | ceil) - 1]),
       p95: (map(.durationMs) | sort | .[((length * 0.95) | ceil) - 1])
     })'
   ```
   Then: top `err.message` values per route; the slowest requests with `requestId`; do slow
   requests share a wallet, a route, a time window?
4. **Database** as `agent_ro`:
   ```sh
   docker compose exec -T postgres psql -U agent_ro -d wallet -c "<query>"
   ```
   - `pg_stat_activity` for `datname = 'wallet'`: connections by `state`, `wait_event_type`,
     and the longest-running statements. Compare the count with the pool size from step 2.
   - `EXPLAIN (ANALYZE, BUFFERS)` only on `SELECT` statements. Take the slow statement from the
     code (`grep` in `wallet-service/src`) and use a real `walletId` from the slow requests.
   - `\d transactions` (or `pg_indexes`) for the indexes on the columns in that statement.
5. **Hypothesis.** It must explain *all* the symptoms (latency and errors and their timing).
   If two fit, give both and the check that would tell them apart.

## Output

```
Incident: <one line, with the time window you looked at>
Most likely cause: <one line>
Evidence:
- <command> → <result with numbers>
- ...
Ruled out: <what you checked that is fine>
Next steps: <concrete actions for a human, e.g. "recreate index ... CONCURRENTLY">
Confidence: high | medium | low
```

If the user wants a ticket, hand the report to `issue-task`.

## Never

- State a cause without at least one piece of evidence from the running system.
- Run `EXPLAIN ANALYZE` on `INSERT`, `UPDATE` or `DELETE`: it executes them.
