---
name: prism
description: "Prism's local index of this repository. Use before editing, renaming or deleting unfamiliar code, to orient in a new repo, to review a PR or diff, to pick a lens, or to run a saved habit."
---

# Prism

Prism answers from a local, resolved dependency graph, not from whichever
files happen to be open. The user cannot see tool output: say what you found
in a line or two, and cite paths.

## Before an edit

A `Prism · prepare` block in context already holds the files, signatures, line
anchors, tests and the command to run them. Use it; do not call
`prepare_change` again for the same task. Otherwise call `prepare_change` with
the task. For a body it did not include, call `graph` with `mode: "symbol"` and
`body: true`.

Skip both for code you already read this session and for local edits: a
comment, a string, a body with no signature change.

## Before renaming, deleting or changing an export

`blast_radius` (or `rename_impact`, `safe_delete`) on the symbol or file. It
lists the dependents that must move together; grep misses re-exports and
aliased imports. Say whether the change is contained or far-reaching. If
something still depends on a file you meant to delete, say so and let the
user choose. Never invent a dependent it did not report.

## After the edit

`test_impact` gives the tests the change reaches and the exact command
(`run[].command`, from `run[].cwd`). Run those, not the whole suite. Prism
never runs tests for you. `guard_session` before you finish says which changed
files no test reaches.

## An unfamiliar repository

One `repository_overview` call, then answer in your own words. If you see
`PRISM_INDEX_REQUIRED`, wait briefly and retry instead of reading at random.

## Reviewing a PR or a diff

1. Get the change (your GitHub tools for a named PR). Call `guard_session`
   with `review: true`, and `base` set to the PR's base branch, or no
   arguments for the working tree. Do not review from the raw diff alone or
   ask for a file list.
2. Read its per-path reach, tests, risk and `lensFindings` before forming an
   opinion. `blast_radius` on a changed export if you need its callers.
3. For a PR description, `guard_session` with `review: true` and
   `format: "prDescription"`. You write the prose. Never write "tests passed"
   unless `verification.lastReceipt` says `SHIP`.
4. Lead the review with the risk; every impact claim cites a path or finding.
   "Contained to the module it touches" is a real outcome.
5. Post, approve or move a ticket only when the user asked for that specific
   action, through the editor's own connectors. Prism holds no third-party
   credentials; if none is connected, give the review as text.

## Lenses

Prism injects one lens per session (Architect for a feature, plan or PR; QA
for finding bugs; Dev for a daily fix; a lens the user names wins). Follow its
procedure until the task is done. `guard_session` with `review: true` checks the
change against it. Manage lenses with `prism lens` in a terminal.

## Habits

A habit is a routine the user saved. Call `habits` with its name (no name
lists them; `found: false` → offer `near` and stop). Do each step in order
with your own connected tools for its `source`, applying `filter`; if a source
is not connected, say so and go on. Never ask for tokens or keys. Write the
result in `output.format`, following `output.template`. Each habit is a
skill file in `~/.prism/skills`; users manage them with
`prism habit add|edit|remove`, so do not edit those files yourself.

## Job workers

A Prism job worker's tools answer against the host checkout, not its
worktree. Structural questions are the same either way; read your own files
for code you just wrote.
