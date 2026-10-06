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

**1. `repository_overview`.** One call. It says what this project is, how
healthy it is, and where to start reading. Start here on any repo you have not
seen this session.

**2. Answer in your own words.** Summarise what you found. Do not paste tool
output at the user — they asked a question, not for a report.

## Before you edit anything here

Orientation tells you where things are. It does not tell you what breaks if you
change them — use `prepare_change`, then `blast_radius`, per the
`prism-safe-change` skill.

## Note on timing

The first intelligence call in a session builds the index and can take a few
seconds on a large repository. That is once, not per call. If you see
`PRISM_INDEX_REQUIRED`, wait briefly and retry rather than falling back to
reading files at random.
