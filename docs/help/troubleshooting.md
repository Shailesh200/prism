---
title: Troubleshooting
description: "Run prism doctor first. Then install, wrong workspace, slow indexing, unavailable signals, MCP issues and error codes."
---

## Start here

```bash
prism doctor
```

It reports the engine version, the install and the server it pins, whether any
editor still launches a published package, which workspace was chosen and which
rule chose it, and whether an index exists and how old it is. Most of what
follows is faster to confirm with `doctor` than to guess at.

`prism doctor --fix` stops the daemon (the next client starts the current
build) and rewrites the editors recorded in `~/.prism/install.json` to that
build. `prism stats --since 1d` shows hook and tool timings and outcomes.

## Doctor says "server … is missing" or "published package referenced"

The editor configs point at a server that is not there, or (when Prism was
installed from a source checkout) at `npx`/`@latest`. Run `prism doctor --fix`,
or `prism install <editor>` again: install writes the path of the local server,
not `npx`. A hand-written `npx` config from [Install](/docs/start/install) is
fine for a normal install.

## Prism is analysing the wrong repository

Usually git-root discovery. Prism walks up for the nearest `.git`, so from a
subdirectory of a monorepo you get the monorepo, and from inside a nested
repository you get the nested one.

`prism doctor` prints the chosen workspace and the rule that chose it. To
override:

```bash
prism overview --workspace ./packages/api
```

## Indexing is slow

Almost always a file count problem, and almost always generated output.

Check the count in `prism doctor`, then exclude what should not be there — build
output, vendored dependencies, generated clients, fixtures.

The other cause is a few enormous files. The max file size setting skips them;
a 40,000-line generated client contributes nothing you would look at.

## Indexing looks stuck, not just slow

Slow is linear progress through many files; stuck is no progress at all.
`prism graph status` shows the daemon and its workspaces. One enormous
generated file is the usual cause (exclude it, or raise `--max-file-bytes`).
If the index itself is wedged, run `prism index`; a corrupt index is moved
aside and rebuilt. It is a derived cache, so nothing else is lost.

## An unfamiliar file count

If it is far higher than expected, something generated is being indexed. If far
lower, an exclude pattern is too broad — a `**/dist/**` that also matches
`src/district/`, for example.

## The index has no files

Either no index, or the index found nothing.

`prism doctor` distinguishes them. No index means indexing failed or never ran;
zero files means everything was excluded or no file is in a language Prism
analyses yet (see [known limitations](/docs/help/known-limitations)).

## A result says a signal is unavailable

That is the intended behaviour, not a failure. Prism marks what it does not know
rather than showing a zero — see
[signal provenance](/docs/concepts/signal-provenance).

Common causes:

| Signal unavailable | Because |
|---|---|
| Churn, ownership, activity | Not a git repository, or shallow-cloned |
| Coverage | No coverage output on disk |

Shallow clones are the surprising one. `git clone --depth 1` in CI leaves no
history to compute churn from.

## A CLI command exits 1 and I expected 0

`1` means it worked and found what you asked about — a `--fail-on` threshold was
met. That is the gate firing, not a failure.

`3` is the failure. See [exit codes](/docs/usage#exit-codes).

## JSON output has an error in it

By design. In `--json` mode both success and failure go to stdout in the same
wrapper, so a script reading one stream never misses a failure:

```json
{ "ok": false, "error": { "code": "PRISM_INVALID_PATH", "message": "…" } }
```

## The prism server does not appear, or no tools register

The client never started the server, or started it and cached a failure. Toggle
the prism server off and on in the client's MCP settings (or restart the client) with the
project folder open, then watch the client's MCP logs for the launch error.
After an update, a running session cannot swap binaries mid-chat — restart the
client once so the newer package loads. `prism doctor --surfaces` shows the
Node each client launches; a Node that is too old fails before any tool
registers.

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

## An MCP tool answers about the wrong repository

The MCP server resolved the wrong workspace — usually it started before the git
project was the open folder. Reload the prism server (Settings → MCP → toggle
the server off and on) with the project open, then retry. The agent passes the workspace
path itself; never paste one into `mcp.json`. If it still resolves wrong, set
`PRISM_WORKSPACE` once — see [install](/docs/start/install).

## An "Authenticating prism…" card with a Skip button

That is the host approving Prism's MCP tools. Prism has no sign-in of its own.
Click **Skip**, then retry what you asked for. It appears once per session.

## The agent asks for a tool that is not listed

The server registers nine tools by default. The others (graphs, findings,
`agents_md`, and more) are opt-in: list them in `extraTools` in
`~/.prism/config.json`. See [Usage](/docs/usage) and the
[MCP reference](/docs/reference/mcp-tools).

## A tool from an older Prism is gone

Prism 2.0 has nine default tools; older tool names were removed with no
aliases, and an old name gets the standard unknown-tool error. See
[MCP tools](/docs/reference/mcp-tools). Installing 2.0 over 1.x moves the 1.x
data once to `~/.prism-backups/<time>/1x/` (nothing is deleted) and keeps your
lenses; delete that folder when you no longer need it. `prism data prune` lists empty workspace
folders, caches of deleted checkouts, and untracked worktrees;
`prism data prune --yes` removes them.

## Error codes

Every error reads `PRISM_X: what happened. What to do.`

| Code | Meaning | What to do |
|---|---|---|
| `PRISM_VALIDATION` | An argument or option is wrong | Read the usage line in the message |
| `PRISM_NOT_FOUND` | A file, symbol, receipt or server bin does not exist | Check the path; for the server, `prism doctor --fix` |
| `PRISM_INVALID_PATH` | A path is outside the workspace or not allowed | Use a path inside the repository |
| `PRISM_INVALID_ID` | An id is malformed | Copy it again from the output that gave it |
| `PRISM_WORKSPACE_NOT_OPEN` | No workspace could be chosen | Run inside a git repository, or pass `--workspace` |
| `PRISM_INDEX_REQUIRED` | The answer needs an index | `prism index` |
| `PRISM_INDEX_FAILED` | Indexing failed | `prism doctor`; then `prism index` |
| `PRISM_ANALYZER_FAILED` | Analysis of a file failed | Usually a parse error in that file; the rest still works |
| `PRISM_GRAPH_ERROR` | The graph query could not run | Rerun; if it repeats, `prism index` |
| `PRISM_IO_ERROR` | A file could not be read or written | Check permissions and free disk space |
| `PRISM_UNSUPPORTED` | Not supported yet (e.g. a language Prism does not analyse) | See [known limitations](/docs/help/known-limitations) |
| `PRISM_CANCELLED` | The operation was cancelled | Rerun it |
| `PRISM_UNKNOWN` | An unexpected failure | Open an issue with `prism doctor` output |

## The editors launch different Prism builds

`prism doctor --surfaces` shows which Prism each editor launches.

## Still stuck

Open an issue with the output of `prism doctor`, the command you ran, and what
you expected. `doctor` output contains no source code.

## Related

[CLI usage](/docs/usage) · [Signal provenance](/docs/concepts/signal-provenance) ·
[FAQ](/docs/help/faq)
