# Stack detection

**How Prism works out what a repository is built with — and why it reports
confidence instead of a yes or no.**

This is the mechanism behind [Repository DNA](./repository-dna.md).

## The detectors

Prism runs a set of independent detectors. Each looks for one thing — React,
Next.js, Express, Prisma, Vitest, Docker — and reports what it found rather than
a verdict.

A detector returns:

| | |
|---|---|
| **Present** | Whether it found anything at all |
| **Confidence** | 0–100, from how much evidence agreed |
| **Evidence** | The specific facts, so you can check the conclusion |
| **Version** | Where a lockfile or manifest states one |

## Why not just read `package.json`

Because `package.json` lies, routinely and without malice:

- Dependencies outlive their use. A migration from Jest to Vitest leaves `jest`
  in the manifest for months.
- Dependencies get installed and never adopted. Someone tried a library in a
  spike and the entry stayed.
- Transitive dependencies appear in lockfiles. Your app does not "use" every
  package in `bun.lock`.
- Monorepos share one root manifest across packages with very different stacks.

A tool that reads the manifest and stops will confidently tell you a repository
uses six test runners. Combining manifest evidence with actual imports and
config files gives an answer you can act on, and reporting the evidence lets you
see when it went wrong.

## Reading the evidence

```bash
prism stack
```

Each signal lists what it found. `config + 312 imports` is a different claim
from `dependency only`, and once you have seen the difference you will read
confidence numbers correctly for the rest of the tool.

## When detection is wrong

**A stale dependency reported at low confidence.** Working as intended. The low
confidence and `dependency only` evidence are the tell.

**A framework you use, not detected.** Usually an unusual setup — a custom
wrapper, a vendored copy, a config file in a non-standard place. The stack
profile is descriptive; a missing signal does not degrade the rest of the
analysis, which is derived from imports rather than from detection.

**Wrong version.** Prism reads what the lockfile says. If the lockfile is stale,
so is Prism.

## Extending it

Detectors are registered in `@prism/intelligence`, so adding one does not mean
touching the analysis pipeline — a detector declares what evidence it looks for
and how strongly each piece counts, and the rest is shared. See
[extension points](../architecture/extension-points.md).

## Related

[Repository DNA](./repository-dna.md) · [Signal provenance](./signal-provenance.md)
