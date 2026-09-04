---
name: prism-onboard
description: Orient yourself in an unfamiliar repository before answering questions or making changes. Use on a repo you have not seen, when asked what a project is or how it is structured, or when a question is about architecture rather than about a specific file. Reads a local index instead of guessing from whichever files happen to be open.
---

# Get your bearings first

Answering a structural question from the two or three files that happen to be
open produces confident, wrong answers. The files an agent opens first are not a
sample of the repository; they are a sample of what the user was last looking
at.

## The procedure

**1. `repository_dna`.** One call, and the fastest way to know what this project
is: languages, frameworks, size, how it is organised. Start here on any repo you
have not seen this session.

**2. Then follow the question.**

- Layout and architecture → `repository_map`
- Monorepo, or you saw multiple packages → `list_packages`
- Where the important code lives → `landmarks`
- Frameworks and versions in detail → `stack_profile`
- What this directory is for → `explain_area`
- Product surfaces rather than folders → `list_features`, `feature_graph`
- General health, before proposing changes → `repository_health`

Two or three calls is usually enough. The point is to stop guessing, not to
inventory everything before answering.

**3. Answer in your own words.** Summarise what you found. Do not paste tool
output at the user — they asked a question, not for a report.

## When the question is about a symbol, not the repository

Skip straight to `find_symbol` or `search_symbols`, then `find_references`.
Orientation is for structural questions; a specific lookup does not need it.

## Before you edit anything here

Orientation tells you where things are. It does not tell you what breaks if you
change them — use `blast_radius` for that, per the `prism-safe-change` skill.

## Note on timing

The first intelligence call in a session builds the index and can take a few
seconds on a large repository. That is once, not per call. If you see
`PRISM_INDEX_REQUIRED`, wait briefly and retry rather than falling back to
reading files at random.
