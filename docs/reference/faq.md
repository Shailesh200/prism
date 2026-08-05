# FAQ

## Does my code leave my machine?

No. Analysis makes zero network calls, enforced by a test that runs the whole
analysis surface with the socket layer trapped.

A few optional features do reach out — GitHub metadata, Core Web Vitals,
avatars — and each is off until you turn it on individually. None of them send
source code. See [consent and privacy](../concepts/consent-and-privacy.md).

## Is Prism an AI coding assistant?

No. Prism does not generate code, and there is no model in it.

It is an analysis engine. It makes an AI assistant considerably better by giving
it real knowledge of your repository, which is a different job — see
[using MCP](../using/mcp.md).

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
[troubleshooting](./troubleshooting.md#indexing-is-slow).

## What is stored, and where?

`.prism/` inside your repository: the index (SQLite), your consent decisions,
health history, and bookmarks. Nothing outside it. No credential is ever
written there.

You can delete `.prism/` at any time; the next run rebuilds it.

## Should I commit `.prism/`?

No. Add it to `.gitignore`. It is a derived cache and it is machine-specific.

## Do the CLI and the extension ever disagree?

They cannot. Both call the same engine, and shared values — risk bands, in
particular — come from one function in `@prism/shared` that both use. A test
asserts the UI agrees with it.

## What is a "band" and why not just show the number?

Numbers imply a precision the underlying signals do not have. The difference
between 61 and 64 is noise; the difference between "Low" and "High Impact
Potential" is a decision. See [risk bands](../concepts/risk-bands.md).

The number is still there when you want it.

## Why does something say "estimated"?

Because it was inferred rather than measured — health history backfilled from
git before Prism was installed, most commonly. Estimated values are
directionally useful and should not be read to the decimal. See
[signal provenance](../concepts/signal-provenance.md).

## Why did a feature get grouped oddly?

Features are inferred, not declared. Confidence tells you how much evidence
agreed; low confidence means it is a guess. See
[feature graph](../concepts/feature-graph.md).

## Can I use it in CI?

Yes, and it is one of the better places for it:

```bash
npx @prism/cli review --base origin/main --fail-on high
npx @prism/cli cycles --fail-on any
```

Exit `1` means the gate fired. Exit `3` means Prism failed. They are deliberately
different so a pipeline can tell them apart without parsing output.

## Can an AI agent turn on a network feature?

No. Consent-gated capabilities are not exposed to MCP at all — not guarded,
absent. An agent cannot give informed consent on your behalf.

## Does Prism modify my code?

No. `rename` and `safe-delete` report what a change would touch; they never
write. The only thing Prism writes is `.prism/`.

The one exception is explicit: with `run.local-build` consent, Prism runs your
repository's own build script to measure bundle weight. That produces whatever
your build produces.

## Is there a hosted version?

No, and that is a design decision rather than a roadmap gap. Prism is
local-first. There is no account, no server, and nothing to sign up for.

## How much does it cost?

Nothing. See the repository for licence details.

## Related

[Troubleshooting](./troubleshooting.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
