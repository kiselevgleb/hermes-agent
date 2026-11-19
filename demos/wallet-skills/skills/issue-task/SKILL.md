---
name: issue-task
description: Create a well-formed GitHub issue for a bug or task in this repo — context, reproduction, acceptance criteria and scope — from a short description, an incident report or a review finding. Use when asked to "create a task", "file a bug", "make an issue for this".
version: 1.1.0
license: MIT
metadata:
  hermes:
    tags: [github, issues, planning, wallet-service]
    related_skills: [incident-analysis, review-pr, qa-handoff]
---

# Create an issue

A good issue lets another engineer start without asking questions.

## Guardrails

- Create issues and comments only. Do not assign people, set milestones or close issues
  unless asked.
- HTTP only to `localhost`, database only as `agent_ro`.
- Show the draft first; create it when the request says to create it or the user confirms.

## Steps

1. **Gather context:** the user's description plus any linked incident report, PR review
   comment or log excerpt. Read the relevant code to name the exact module and endpoint.
2. **Reproduce bugs when it is cheap** (curl against `localhost:3000`, fresh player) and include
   the real request and response. If you could not reproduce it, say so in the issue.
3. **Check for duplicates:**
   ```sh
   gh issue list --state all --search "<keywords>"
   ```
   If one exists, propose a comment there instead and tell the user.
4. **Labels:** `gh label list`. Use `bug` or `task` and one area (`wallet`, `api`, `db`), but only
   labels that exist; mention any missing ones instead of failing the create.
5. **Create:**
   ```sh
   gh issue create --title "<title>" --label bug --label wallet --body-file - <<'MD'
   ...
   MD
   ```
   Report the issue URL.

## Issue format

```
Title: <area>: <what is wrong / what to do>   (≤ 70 chars)

## Context
<why this matters; where it was found: incident, review, user report, with a link>

## Reproduction (bugs)
<request, response, expected vs actual; or "not reproduced: <why>">

## Acceptance criteria
- [ ] <observable outcome 1>
- [ ] <observable outcome 2>
- [ ] Tests cover <case>

## Out of scope
<what this issue does not cover>

## Notes
<suspected cause and relevant files, marked as a hypothesis>
```

## Never

- Present a guess about the cause as a fact.
- Put numbers in the issue that did not come from a run or from the linked source.
