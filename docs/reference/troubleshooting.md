# Troubleshooting

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
[signal provenance](../concepts/signal-provenance.md).

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
See [feature graph](../concepts/feature-graph.md).

## A CLI command exits 1 and I expected 0

`1` means it worked and found what you asked about — a `--fail-on` threshold was
met. That is the gate firing, not a failure.

`3` is the failure. See [exit codes](../using/cli.md#exit-codes).

## JSON output has an error in it

By design. In `--json` mode both success and failure go to stdout in the same
envelope, so a script reading one stream never misses a failure:

```json
{ "ok": false, "error": { "code": "PRISM_INVALID_PATH", "message": "…" } }
```

## An MCP tool says an index is required

The repository has not been indexed and the build failed — usually the MCP
server started with the wrong cwd (or no git root). Confirm the client launched
it from the open project, or set `PRISM_WORKSPACE` / `--workspace` once. Run
`prism doctor` in that same directory to see what the engine resolves.

## An MCP result is missing items

Every list is bounded. The response carries `totalCount` and `truncated`; raise
`limit` if you need more. See [using MCP](../using/mcp.md).

## A path was refused

Paths outside the workspace are refused rather than clamped. Clamping would
report "nothing depends on this" about a file Prism never looked at, which is
worse than an error.

Path arguments resolve from your current directory, not the repository root.

## The extension will not open

Reload the window first. If it persists, check the Output panel → Prism for the
error, and confirm the folder is open as a workspace — Prism needs a folder, not
a single file.

## Still stuck

Open an issue with the output of `prism doctor`, the command you ran, and what
you expected. `doctor` output contains no source code.

## Related

[CLI](../using/cli.md) · [Signal provenance](../concepts/signal-provenance.md) · [FAQ](./faq.md)
