---
title: Troubleshooting
description: "Doctor first — then wrong workspace, slow indexing, unavailable signals, MCP issues."
---

## Start here

```bash
prism doctor
```

It reports the engine version, which workspace was chosen and which rule chose
it, whether an index exists and how old it is, and what is available in the
environment. Most of what follows is faster to confirm with `doctor` than to
guess at.

## Prism is analysing the wrong repository

Usually git-root discovery. Prism walks up for the nearest `.git`, so from a
subdirectory of a monorepo you get the monorepo, and from inside a nested
repository you get the nested one.

`prism doctor` prints the chosen workspace and the rule that chose it. To
override:

```bash
prism health --workspace ./packages/api
```

## Indexing is slow

Almost always a file count problem, and almost always generated output.

Check the count in `prism doctor`, then exclude what should not be there — build
output, vendored dependencies, generated clients, fixtures. In the extension:
Settings → Indexing → Exclude globs.

The other cause is a few enormous files. The max file size setting skips them;
a 40,000-line generated client contributes nothing you would look at.

## Indexing looks stuck, not just slow

Slow is linear progress through many files; stuck is no progress at all. The
extension status bar shows which file is being indexed — if it has not moved
in minutes, one enormous generated file is the usual cause (exclude it, or
raise `--max-file-bytes`). If the index itself is wedged, delete `.prism/` and
reindex — it is a derived cache and rebuilds from scratch. Nothing else is
lost.

## An unfamiliar file count

If it is far higher than expected, something generated is being indexed. If far
lower, an exclude pattern is too broad — a `**/dist/**` that also matches
`src/district/`, for example.

## The map is empty

Either no index, or the index found nothing.

`prism doctor` distinguishes them. No index means indexing failed or never ran;
zero files means everything was excluded or nothing is in a language Prism
parses.

## A screen says a signal is unavailable

That is the intended behaviour, not a failure. Prism marks what it does not know
rather than showing a zero — see
[signal provenance](/docs/concepts/signal-provenance).

Common causes:

| Signal unavailable | Because |
|---|---|
| Churn, ownership, activity | Not a git repository, or shallow-cloned |
| Coverage | No coverage output on disk |
| Bundle weight | No stats artifact, and no `run.local-build` consent |
| Web vitals | Not consented, or Lighthouse not installed |
| CI and PR data | No `network.github` consent |

Shallow clones are the surprising one. `git clone --depth 1` in CI leaves no
history to compute churn from.

## Health history looks flat before a certain date

Points before you installed Prism are backfilled from git history and marked
**estimated**. They are directionally useful and not precise. Measured points
start when Prism did.

## A feature grouping looks wrong

Features are inferred from imports, naming and directory structure — the
repository does not declare them. Confidence says how much evidence agreed; a
low percentage means it is a guess.

`prism features` shows the confidence, and `prism explain <path>` shows why a
file was placed where it was. Unusual layouts genuinely produce worse groupings.
See [graphs](/docs/concepts/graphs).

## A CLI command exits 1 and I expected 0

`1` means it worked and found what you asked about — a `--fail-on` threshold was
met. That is the gate firing, not a failure.

`3` is the failure. See [exit codes](/docs/usage#exit-codes).

## JSON output has an error in it

By design. In `--json` mode both success and failure go to stdout in the same
envelope, so a script reading one stream never misses a failure:

```json
{ "ok": false, "error": { "code": "PRISM_INVALID_PATH", "message": "…" } }
```

## The prism server does not appear, or no tools register

The client never started the server, or started it and cached a failure. Toggle
prism off/on in the client's MCP settings (or restart the client) with the
project folder open, then watch the client's MCP logs for the launch error.
After an update, a running session cannot swap binaries mid-chat — restart the
client once so the newer package loads. Confirm Node 26+ with `node -v`; an old
Node fails before any tool registers.

## An MCP tool says an index is required

The repository has not been indexed and the build failed — usually the MCP
server started with the wrong cwd (or no git root). Confirm the client launched
it from the open project, or set `PRISM_WORKSPACE` / `--workspace` once. Run
`prism doctor` in that same directory to see what the engine resolves.

## An MCP result is missing items

Every list is bounded. The response carries `totalCount` and `truncated`; raise
`limit` if you need more. See [using MCP](/docs/usage).

## A path was refused

Paths outside the workspace are refused rather than clamped. Clamping would
report "nothing depends on this" about a file Prism never looked at, which is
worse than an error.

Path arguments resolve from your current directory, not the repository root.

## The extension will not open

Reload the window first. If it persists, check the Output panel → Prism for the
error, and confirm the folder is open as a workspace — Prism needs a folder, not
a single file.

## Dispatch: start_job says it cannot see a git repository

The MCP server resolved the wrong workspace — usually it started before the git
project was the open folder. Reload the prism server (Settings → MCP → toggle
prism off/on) with the project open, then retry. The agent passes the workspace
path itself; never paste one into `mcp.json`. If it still resolves wrong, set
`PRISM_WORKSPACE` once — see [install](/docs/start/install).

## Dispatch: the worker is not signed in

Say **prism init**. In Cursor a Cursor login page opens in your browser; in
Claude Code, init checks the `claude` CLI — if told to, run `claude` once in a
terminal and sign in. Do not paste API keys into `mcp.json`; sign-in lives in
the host's own store. `dispatch_doctor` reports the same state as a check.

## Dispatch: an "Authenticating prism…" card with a Skip button

That is the host approving Prism's MCP tools, not worker sign-in. Click
**Skip**, then retry what you asked for. It appears once per session.

## Dispatch: start_job asks you to confirm a dirty tree

A checkout job edits your working tree, so uncommitted changes you already had
would mix with the job's edits. The job pauses for confirmation instead of
guessing — say it is fine and the agent re-runs with that confirmation, or
commit/stash your work first. Ask for "a separate branch" and the job takes a
worktree instead, leaving your tree untouched.

## Dispatch: a job has gone quiet

A job with no activity for several minutes is stalled, not thinking. Ask
**where are we** or open `job_logs` for the last thing it actually did, then
resume or cancel it (`job_control`). Do not wait on a stalled job.

## Dispatch: a job was refused before it started

Admission is gated on free memory (and a max-jobs cap), so a heavy machine
postpones new teammates rather than thrashing. Close what you can and retry,
or let a running job finish first.

## Dispatch: the job finished but "produced no reviewable change"

The worker stopped without landing an edit — the review lists only files the
job actually touched, and there were none. Re-brief with a sharper PRD (what
to change, where, and how you will tell it worked) and run it again.

## Dispatch: the jobs board (Console) does not open

Any Prism tool starts the local hub; open
`http://prismhq.localhost:17330/`. If it stays unreachable, check the hub was
not opted out with `PRISM_HUB=0`, and that nothing else holds port 17330.

## Dispatch: the Console says the link is unauthorized

Console URLs carry a per-session token in the query string. Open the full
"Watch live at …" URL exactly as `start_job` or `list_jobs` returned it —
stripping the query string is what produces this. A restarted hub mints a new
token; ask **where are we** for a fresh link.

## Still stuck

Open an issue with the output of `prism doctor`, the command you ran, and what
you expected. `doctor` output contains no source code.

## Related

[CLI usage](/docs/usage) · [Signal provenance](/docs/concepts/signal-provenance) ·
[FAQ](/docs/help/faq)
