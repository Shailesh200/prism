---
name: prism-review-pr
description: Review a pull request or a working-tree diff using structural analysis rather than reading the diff alone. Use when asked to review a PR, review changes, check a diff before merging, or say whether a change is safe to land. Combines Prism's impact analysis with whatever GitHub and issue-tracker tools the editor already has.
---

# Review a change with its blast radius

Reading a diff tells you what the author wrote. It does not tell you what else
depends on the lines they touched, and that is where review actually catches
things. Prism can answer the second question against a local index; run it
before forming an opinion.

## The procedure

**1. Get the change.** If the user named a PR, fetch its branch or diff with
your GitHub tools. Then call `review_changes` (with `base` set to the PR's base
branch, or no arguments for the working tree). Do not review from the raw diff
alone, and do not ask the user for a list of files.

**2. Understand the repository, if you do not already.** `repository_overview`
once per session for an unfamiliar repo. Skip it for a repo you have already
looked at this session.

**3. Read the report before forming an opinion.** `review_changes` gives, per
path, how far the change reaches and which tests reach it, an overall risk, and
`lensFindings`: checks Prism computed (a new dependency between packages, a new
import cycle, a helper that already exists, changed exports whose callers were
not edited, code no test reaches). Call `blast_radius` on any exported symbol
the diff changed if you need the callers listed.

**4. Write the PR description, if asked.** Call
`review_changes` with `format: "prDescription"`. It returns what changed (diff
stats), the impact (areas affected, from the code's import graph) and
verification (tests that reach the change, paths no test reaches, and the last stored
verdict, only if Prism has one for these files). You write the prose. Never
write "tests passed" unless `verification.lastReceipt` says `proven`; otherwise
say what `verification.statement` says.

**5. Write the review.** Lead with the risk, not a file-by-file walk. Every
claim about impact cites the path or the finding that produced it. If nothing
alarming came up, say so: "this is contained to the module it touches" is a
real outcome. Say plainly when a risky path has no test.

**6. Post it only when the user confirms.** Use the editor's own GitHub
connector to leave the review or the description, and only after the user
said to post it. Use your own issue-tracker tools only if the user asked.

## Boundaries

Prism has no GitHub or Linear connector of its own and holds no third-party
credentials. Posting and ticket transitions go through the connectors this
editor has. If none is connected, give the review as text and say it was not
posted.

Never move a ticket or approve a PR unless the user asked for that specific
action. Producing a review is not permission to submit one.
