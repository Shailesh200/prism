---
title: FAQ
description: "Privacy, languages, git, CI, agents, and what Prism will not do."
---

## Does my code leave my machine?

No. Analysis makes zero network calls, enforced by a test that runs the whole
analysis surface with the socket layer trapped.

A few optional features do reach out — GitHub metadata, Core Web Vitals,
avatars — and each is off until you turn it on individually. None of them send
source code. See [consent and privacy](/docs/concepts/consent-and-privacy).

## Is Prism an AI coding assistant?

No. The analysis engine has no model in it and generates nothing — it answers
structural questions and makes an AI assistant considerably better by giving
it real knowledge of your repository (see [using MCP](/docs/usage)).

When you ask for a change, [Dispatch](/docs/guides/dispatch) does not become one
either: the edit is made by your editor's own agent — Cursor or Claude Code,
under your existing sign-in — and Prism runs the checks when it stops.

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

`.prism/` inside your repository: the index (SQLite), your consent decisions,
health history, and bookmarks. Nothing outside it. No credential is ever
written there.

You can delete `.prism/` at any time; the next run rebuilds it.

## Should I commit `.prism/`?

No. Add it to `.gitignore`. It is a derived cache and it is machine-specific.

## Do the CLI and the extension ever disagree?

They cannot. Both call the same engine, and shared values — risk bands, in
particular — come from one function in `@repo-prism/shared` that both use.

## What is a "band" and why not just show the number?

Numbers imply a precision the underlying signals do not have. See
[risk bands](/docs/concepts/risk-bands).

## Why does something say "estimated"?

Because it was inferred rather than measured — health history backfilled from
git before Prism was installed, most commonly. See
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

## Who writes the code in a Dispatch job?

Your own editor's agent — a Cursor agent in Cursor, a Claude Code agent in
Claude Code — signed in with your existing session. Prism writes the brief,
watches the run, and runs typecheck and tests when the worker stops. Dispatch
itself makes no network calls and holds no third-party tokens; connectors
(Slack, Linear, GitHub, Calendar) belong to your agent window, not to Prism.
See [Dispatch](/docs/guides/dispatch).

## Did the job commit or push anything?

No. A checkout job leaves its edits uncommitted in your tree — you review the
changed files and say "commit it" (which commits only the job's files) or
commit yourself. A worktree job gets one commit on its own branch and is never
merged. Prism never pushes.

## Why does the agent ask "teammate or here?" before changing code?

Because guessing wrong strands a background job or edits a tree you were
working in. The default is to ask once; say "stop asking" and it holds for the
session, or set it permanently with `configure` → `dispatchMode`: `auto`
always dispatches, `inline` never does unless you ask outright.

## Does Prism modify my code?

Only when you ask for a change. Intelligence tools — `rename`, `safe-delete`,
blast radius, the reports — report what a change would touch; they never
write. A [Dispatch](/docs/guides/dispatch) job edits your checkout because you
asked it to, and leaves the edits uncommitted until you say so.

The only thing Prism writes on its own is `.prism/`. The one execution path is
explicit: with `run.local-build` consent, Prism runs your repository's own
build script to measure bundle weight.

## Is there a hosted version?

No, and that is a design decision rather than a roadmap gap. Prism is
local-first. There is no account, no server, and nothing to sign up for.

## How much does it cost?

Nothing. See the repository for licence details.

## Related

[Troubleshooting](/docs/help/troubleshooting) ·
[Consent and privacy](/docs/concepts/consent-and-privacy)
