---
name: review-pr
description: First-pass review of a GitHub pull request in this repo — money and data consistency, performance, correctness, security and architecture fit — as one GitHub review with inline comments. Use when asked to "review PR #N", "check this PR", "do a first pass".
version: 1.1.0
license: MIT
metadata:
  hermes:
    tags: [code-review, github, wallet-service]
    related_skills: [issue-task, qa-handoff]
---

# First-pass PR review

You are the first reviewer, not the last. A human reads your comments and makes the decision.
Your job is to catch what a careful senior engineer would catch, so the human can spend their
time on design.

## Guardrails

- Comment only. Never approve, request changes, merge, push or edit files.
- `gh` and read-only `git` (`fetch`, `log`, `diff`, `show`, `merge-base`). Nothing else is needed.
- Publish only when this request asks for it ("review and post", "leave a review on #N").
  Otherwise show the draft and wait for "post it".

## Steps

1. **Read the PR.**
   ```sh
   gh pr view <N> --json number,title,body,baseRefName,headRefName,headRefOid,files
   gh pr diff <N>
   gh pr checks <N>            # CI state; "no checks" is fine, say so
   ```
2. **Read the surrounding code** for every change: callers, the entity, the module, the
   existing tests. `git fetch origin <headRefName>` and `git show <headRefOid>:<path>` give the
   file as it is on the branch. Do not comment on code you have not read.
3. **Check, in this order:**
   - **Money and data consistency** — one transaction per operation, wallet row lock
     (`FOR UPDATE`), idempotency on `externalId` (lookup *and* the unique constraint), integer
     amounts, no lost update between read and write. Schema changes: what does the migration do
     to existing rows?
   - **Performance** — queries in a loop (N+1), `OFFSET` pagination, new filters or sorts
     without an index, unbounded result sets.
   - **Correctness** — edge cases, error mapping to HTTP codes, DTO validation.
   - **Security** — injection (`$queryRawUnsafe` with interpolated input), secrets in code or logs.
   - **Architecture** — module boundaries, controller/service split, tests for new behaviour.
4. **For each finding** write: what goes wrong as a concrete input or sequence ("the same win
   sent twice → balance credited twice"), why, and a suggested fix. Point to the existing code
   when the fix already exists elsewhere in the repo. No style points a linter would catch.
5. **If you are not sure**, ask a question instead of asserting.

## Output

One review: a summary body plus inline comments.

- Group by severity: **Blocker**, **Should fix**, **Consider**.
- End the body with 2–3 lines: what the PR does, whether it is safe to merge as is.
- If there are no real problems, say so in one line. Do not invent findings.

Post it in one call. `gh pr review` cannot attach inline comments, so use the API:

```sh
gh api repos/{owner}/{repo}/pulls/<N>/reviews --method POST --input - <<'JSON'
{
  "commit_id": "<headRefOid>",
  "event": "COMMENT",
  "body": "<summary grouped by severity>",
  "comments": [
    { "path": "wallet-service/src/...", "line": 42, "side": "RIGHT", "body": "**Blocker** ..." }
  ]
}
JSON
```

`line` is the line number in the new file and must be inside a diff hunk. GitHub rejects the
whole review (422) otherwise. Findings about lines outside the diff go into the body.
`path` is relative to the repository root.
