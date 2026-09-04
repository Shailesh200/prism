---
name: prism-ship
description: Take finished work from a branch to a raised pull request with a description grounded in what actually changed, request reviewers, and move the ticket. Use when asked to ship, raise a PR, open a pull request, or wrap up a piece of work. Prism writes the impact section; the editor's GitHub and issue-tracker tools do the rest.
---

# Ship it

A PR description written from the diff reads like a changelog. One written from
the impact tells a reviewer where to look, which is the only thing a description
is for.

## The procedure

**1. Check the work is complete.** `review_changes` with no paths. If it flags
something, raise it with the user before opening a PR — better to ask now than
to have a reviewer find it.

**2. Describe the impact.** `blast_radius` on the primary changed paths. What
this produces is the part of the description that a reviewer cannot get by
reading the diff: which areas are affected, and how far the change reaches.

**3. Name the verification.** `test_impact` on the changed paths. State which
suites cover the change and — if you ran them in this session — that they
passed. Do not claim a run you did not see.

**4. Write the description.** Structure it as:

- **What changed**, in one or two sentences of plain prose
- **Why** — the ticket, the bug, the request
- **Impact** — from blast radius: the affected areas, and anything a reviewer
  should look at closely
- **Verification** — what was run, what was not

Skip empty sections rather than filling them with "N/A".

**5. Raise it with your own tools.** Push the branch and open the PR with the
editor's GitHub tools. Request reviewers if the user asked for specific people
or the repository has a convention you can see.

**6. Move the ticket.** If the work came from Linear or Jira and the user asked
you to update it, transition it with the editor's own connector and link the PR.

## Boundaries

Prism holds no credentials for GitHub, Linear or Jira. Everything in steps 5 and
6 runs through connectors configured in this editor. If none is connected,
produce the description as text, tell the user the PR was not raised, and stop.

Confirm before pushing to a shared branch, before requesting review from named
people, and before any ticket transition. Writing a description is not
permission to raise the PR.
