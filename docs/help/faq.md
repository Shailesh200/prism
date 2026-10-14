---
title: FAQ
description: "Privacy, languages, git, CI, agents, and what Prism will not do."
---

## Does my code leave my machine?

No. Analysis makes zero network calls, enforced by a test that runs the whole
analysis surface with the socket layer trapped.

Prism 2.0 has no optional network features. Nothing it does sends source
code anywhere. See [privacy](/privacy).

## Does Prism write code?

No. The analysis engine has no model in it and generates nothing. It answers
structural questions and gives your coding agent real knowledge of your
repository (see [using MCP](/docs/usage)). Your agent makes the edit, in your
chat. When it stops, the receipt runs the checks the change reaches.

## Which languages?

TypeScript and JavaScript are fully analysed — imports, symbols, references,
graphs, the lot.

Other languages are indexed for structure, size and churn, so file-level and
git-derived signals work everywhere. Symbol-level analysis does not.

## Does it need my repository to be a git repository?

No, but several signals do. Churn, ownership, activity and change review all
read git history. Without git, those are marked unavailable rather than shown as
zero.

Shallow clones (`--depth 1`) have the same effect, which surprises people in CI.

## How long does indexing take?

Seconds for most repositories; the first run in a very large monorepo takes
longer. After that it is incremental — a save reindexes one file.

If it is slow, something generated is probably being indexed. See
[troubleshooting](/docs/help/troubleshooting#indexing-is-slow).

## What is stored, and where?

`~/.prism/` (or `PRISM_HOME`): one folder per workspace with the index
(SQLite), memories, receipts and the Envelope ledger; your lenses in
`~/.prism/lenses/`; `install.json` and `events.jsonl`. No credential is ever
written there.

Workspace folders are derived caches; delete one at any time and the next run
rebuilds it. `prism uninstall --purge` removes everything.

## Should I commit `.prism/`?

No. Add it to `.gitignore`. It is a derived cache and it is machine-specific.

## Do the CLI and the MCP server ever disagree?

They cannot. Both call the same engine, and shared values — risk bands, in
particular — come from one function in `@repo-prism/shared` that both use.

## What is a "band" and why not just show the number?

Numbers imply a precision the underlying signals do not have. See
[risk bands](/docs/concepts/risk-bands).

## Why does something say "estimated"?

Because it was inferred rather than measured — ownership or churn from a
shallow clone, most commonly. See
[signal provenance](/docs/concepts/signal-provenance).

## Why did a feature get grouped oddly?

Features are inferred, not declared. Confidence tells you how much evidence
agreed; low confidence means it is a guess. See [graphs](/docs/concepts/graphs).

## Can I use it in CI?

Yes — see [Wire into CI](/docs/guides/wire-into-ci):

```bash
npx -y @repo-prism/cli review --base origin/main --fail-on high
npx -y @repo-prism/cli cycles --fail-on any
```

Exit `1` means the gate fired. Exit `3` means Prism failed.

## Can an AI agent turn on a network feature?

No. Consent-gated capabilities are not exposed to MCP at all — not guarded,
absent. An agent cannot give informed consent on your behalf.

## What is the receipt?

When your agent stops, the Prism stop hook runs the checks the change reaches —
this repository’s own lint, test, and typecheck scripts, or **—** if none
exist — and prints whether the change is proven, unproven, or failed. It comes
with the Prism plugin pack. Prism never commits or pushes.

## Where did the background jobs go?

They were removed (ADR-0064). Your agent makes every edit in your own chat.
Memories live in the CLI — see [Remember context](/docs/guides/remember-context).
`prism data prune` lists leftover local folders; `--yes` removes them.

## Does Prism modify my code?

No. The tools — `rename`, `safe-delete`, blast radius, review — report
what a change would touch; they never write. Your agent makes edits.

The only thing Prism writes on its own is its data under `~/.prism/`.

## What is Envelope?

A local receipt for every Prism tool call — tool name, item counts,
whether the list was cut short, and JSON bytes. No prompts, no paths, no
source. `prism envelope` prints it. See
[Envelope](/docs/guides/envelope).

## What is prepare_change?

One call before you edit. It returns the files to open, helpers to reuse,
three House Style exemplars, notes, and a work order — paths and names only,
never file bodies. CLI: `prism prepare`. See
[Prepare a change](/docs/guides/prepare-a-change).

## When is a finding “fixed”?

When a **re-scan** drops its fingerprint. An edit alone is not enough. See [Findings](/docs/guides/findings).

## Does Prism write AGENTS.md into my repo?

No. `prism agents-md generate` writes only
`~/.prism/workspaces/<key>/agents.md`. Do not copy it into git. See
[Remember context](/docs/guides/remember-context).

## Is there a hosted version?

No, and that is a design decision rather than a roadmap gap. Prism is
local-first. There is no account, no server, and nothing to sign up for.

## How much does it cost?

Nothing. See the repository for licence details.

## Related

[Troubleshooting](/docs/help/troubleshooting) ·
[privacy](/privacy)
