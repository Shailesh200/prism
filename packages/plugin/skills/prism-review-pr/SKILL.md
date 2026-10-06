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

**1. Get the change.** If the user named a PR, fetch it with your GitHub tools.
Otherwise call `guard_session`. It ranks the working-tree change. Do not ask
the user for a list of files, and do not review from the raw diff alone.

**2. Understand the repository, if you do not already.** `repository_overview`
once per session, for an unfamiliar repo. Skip it for a repo you have already
looked at this session; it is context, not a per-review step.

**3. Read what `guard_session` flagged.** Paths and risk are the input to the
next step, not the conclusion.

**4. Take the blast radius of the risky paths.** Call `blast_radius` on the
flagged files and on any exported symbol the diff changed. This is the step that
distinguishes this review from reading the diff: a two-line change to a widely
imported module is a bigger event than a hundred lines in a leaf.

**5. Ask the lenses.** `review_with` for architect, qa, and dev. Run each brief
as its own subagent, then record the verdicts. You do the thinking; Prism
supplies the evidence.

**6. Write the review.** Lead with the risk, not with a file-by-file walk.
Every claim about impact should cite what produced it, so the author can check
it. If blast radius found nothing alarming, say so — "this is contained to the
module it touches" is a real review outcome and worth stating. Say plainly when
a risky path has no test covering it.

**7. Post it, if the user asked you to.** Use your own GitHub tools to leave the
review or the comments. Use your own issue-tracker tools (Linear, Jira) to move
the ticket if the user asked for that too.

## Boundaries

Prism has no GitHub or Linear connector of its own — it holds no third-party
credentials at all. Posting and ticket transitions go through the connectors
configured in this editor. If none is connected, produce the review as text and
say it was not posted rather than claiming it was.

Never move a ticket or approve a PR unless the user asked for that specific
action. Producing a review is not permission to submit one.
