---
name: qa-handoff
description: Write a manual-QA instruction for a fix and post it as a GitHub issue comment, only after confirming the fix is what is actually serving locally and running every case. Use when asked "how should QA test #N", "write test steps", "can this go to QA?".
version: 1.1.0
license: MIT
metadata:
  hermes:
    tags: [qa, verification, github, wallet-service]
    related_skills: [review-pr, issue-task]
---

# Verified QA handoff

A tester follows the instruction literally and treats every expected value as the truth. A
wrong value raises a false bug or hides a real one. So the instruction is posted only when:

1. it points at an environment where the fix really runs;
2. every step can be done by the tester (Swagger UI at `http://localhost:3000/api`, or curl);
3. every number in it came from a response, not from reading code.

## Guardrails

- HTTP only to `localhost:3000`. Database not needed; if used, only `agent_ro`.
- Never rebuild, redeploy or restart anything yourself. If the fix is not running, stop.
- Publish only when this request asks for it. Otherwise show the draft.

## Steps

1. **Read the issue and the fix PR.**
   ```sh
   gh issue view <issue>
   gh pr view <pr> --json number,state,headRefName,headRefOid,mergeCommit,body
   gh pr diff <pr>
   ```
   Derive the cases from what changed, including paths that deliberately did not change
   (regression cases). Note what is out of scope.

2. **Confirm the fix is serving.** Do not trust "merged" or "deployed".
   ```sh
   git fetch origin
   curl -s localhost:3000/version          # {"commit": "<running>"}
   ```
   - `dev` → the image was built without a commit. **Stop**: ask for a rebuild with
     `GIT_COMMIT=$(git rev-parse HEAD)`.
   - PR merged → `git merge-base --is-ancestor <mergeCommit.oid> <running>`.
     PR open → `git merge-base --is-ancestor <headRefOid> <running>`.
     Exit code 1 → **stop**.
   - Grep the built code for something from the diff that survives compilation: an identifier,
     a string literal, an SQL fragment. Types and comments do not survive.
     ```sh
     docker compose exec -T wallet-service grep -rn "<fragment>" dist/
     ```
     For migrations, check `prisma/migrations/` in the container for the new folder.

   If either check fails, **stop** and report: what is running, what is expected, what a human
   needs to do (rebuild, redeploy). Do not write cases.

3. **Design cases.** Each case starts from a fresh player (`POST /players`), so cases do not
   depend on each other or on old data. Use new `externalId` values per run.
   - fix cases — the scenario from the issue;
   - idempotent replay — the same request again → same response, balance unchanged;
   - the neighbouring branches of the code (bet vs win, deposit vs rollback);
   - regression cases for behaviour that must not change.
   Start each case with a checkpoint step: the starting balance.

4. **Run every case** with curl against `localhost:3000` and keep the raw responses. Copy the
   expected values from them. If a result disagrees with your reading of the code, find out why
   before writing anything.

5. **"With the bug" values** are numbers too. Take them from a recorded run against the buggy
   build: the reproduction in the issue (only if it shows real responses) or a run you made
   earlier in this session. Name the source. If there is none, write "not measured".

6. **Write the comment** and post it to the issue only if asked:
   ```sh
   gh issue comment <issue> --body-file - <<'MD'
   ...
   MD
   ```

## Comment format

~~~markdown
## QA: how to verify
Checked on commit <running> (PR #<pr>), localhost:3000, <date>. All cases below were run; the values are from those responses.

### Setup
Open http://localhost:3000/api. Amounts are integer cents. Create a player with POST /players and use `wallet.id` from the response.

### Steps of one case
1. POST /wallets/{walletId}/deposit
   ```json
   { "externalId": "qa-dep-1", "amount": 10000 }
   ```
   → check: `balanceAfter` = 10000
2. ...

### Cases
- Case A — <endpoint>, <input> → expected <value>. With the bug: <value> (<source>).
- ...

### Not a bug
<out-of-scope behaviour the tester may notice>
~~~

## When you stop

```
Not ready for QA.
Running: <commit or "dev">
Expected: a build containing <commit> (PR #<pr>)
Checks: <command> → <result>
Needed: <rebuild / deploy step for a human>
```
