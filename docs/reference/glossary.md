---
title: Glossary
description: "Terms that mean something specific in Prism."
---

**Band** — A risk score sorted into Low, Moderate or High. One definition,
shared by every surface. See [risk bands](/docs/concepts/risk-bands).

**Blast radius** — Everything a change to one file or symbol could affect:
dependents, tests, features, and a risk band. See
[Before you edit](/docs/guides/before-you-edit).

**Churn** — How much an area has changed recently, from git history. Unavailable
without git, including in shallow clones.

**Confidence** — How much evidence agreed on an inference, as a percentage. Used
on features and stack detection. Low confidence means it is a guess.

**Dependency graph** — Files as nodes, imports as edges. The structural spine
that impact analysis is computed from. See [graphs](/docs/concepts/graphs).

**DNA** — The identity of a repository: languages, frameworks, domains, and
conventions. See
[DNA and stack](/docs/concepts/dna-and-stack).

**Envelope** — A local JSONL ledger of Prism tool calls: tool, counts,
truncated, bytes. Never source. Shown by `prism stats`. See
[Envelope](/docs/concepts/envelope).

**Estimated** — Inferred rather than measured. Directionally useful; not precise.
Marked as such wherever it appears. See
[signal provenance](/docs/concepts/signal-provenance).

**Feature** — A group of files that appear to implement one capability, inferred
from imports, naming and structure. Repositories do not declare these. See
[graphs](/docs/concepts/graphs).

**Finding** — A concrete issue (unused export, duplicate implementation,
wrapper) identified by a fingerprint. Resolved only when a re-scan drops that
fingerprint. See [Findings](/docs/guides/findings).

**Guard** — Rank of this session’s dirty files by blast risk, minus
pre-existing dirt. See [Guard a session](/docs/guides/guard-a-session).

**House Style** — Three exemplars (canonical, recent, older) for how this
repo already does a pattern — route-handler, screen, colocated-test, worker.
Returned by Prepare. See [Prepare a change](/docs/guides/prepare-a-change).

**Hotspot** — High churn crossed with high complexity. The intersection is what
matters; neither metric alone identifies it.

**Index** — Prism's parsed copy of your repository, in
`.prism/cache/index.sqlite`. Every answer derives from it. See
[the repository index](/docs/concepts/repository-index).

**Iris** — The accumulated knowledge of a workspace: the index, graphs, DNA,
landmarks, health, findings, and memories. The Iris screen in the IDE shows
facts plus the Envelope scoreboard — not the repository map. An aperture, not a persona
— never first person, never an avatar. See
[Envelope and Iris](/docs/guides/envelope).

**Spectrum** — The browser app (formerly Playground) that indexes a local
repository. The same map appears in the IDE. The Iris screen does not mount
that map — it shows facts and Envelope instead.

**Knowledge graph** — Semantic relationships beyond imports: what a symbol is,
what it relates to, what it belongs to. See [graphs](/docs/concepts/graphs).

**Landmark** — A notable place in a repository — an entry point, a hub, a
boundary. What you would point at while explaining the codebase to someone new.

**Layer** — An overlay on the map that colours structure by one dimension:
coupling, churn, tests, risk, ownership, features.

**Living AGENTS.md** — A contributor sheet generated from the index into
`~/.prism/workspaces/<key>/agents.md` only. Never written into git. See
[Remember context](/docs/guides/remember-context).

**Measured** — Read from real output rather than inferred. The counterpart to
estimated.

**Memory** — A note about the repository saved with `prism remember`, optionally
anchored to a symbol or path. Prepare hands it back. See
[Remember context](/docs/guides/remember-context).

**MCP** — Model Context Protocol, the standard by which an AI client calls
external tools. Prism ships an MCP server. See [using MCP](/docs/usage).

**Orphan** — A file left dead because the only thing reaching it was deleted.
Reported by safe delete. Guard also flags a *new* file with no inbound
imports. See [Delete safely](/docs/guides/delete-safely).

**Pack** — The ranked file list from `prepare_change`: paths, symbols, why,
map-token weights. Not file bodies. See
[Prepare a change](/docs/guides/prepare-a-change).

**Prepare** — One call before an edit: pack + reuse + House Style + notes +
work order. CLI `prism prepare`. See
[Prepare a change](/docs/guides/prepare-a-change).

**Provenance** — Whether a value was measured, estimated, or is unknown. See
[signal provenance](/docs/concepts/signal-provenance).

**Receipt** — What the stop hook prints when the agent stops: the checks the
change reached, and whether it is proven, unproven, or failed.

**Surface** — A way of using Prism: the extension, the CLI, the MCP server, the
Spectrum app. All of them consume the same engine and compute nothing themselves.

**Unavailable** — Prism does not know this, and says so instead of showing zero.
A repository with no coverage report and one with genuinely zero coverage are
not the same repository.

**Work order** — In-scope, off-limits (generated/vendor), and needs-sign-off
paths for a task. Advisory unless an Accepted ADR arms the write veto. See
[Prepare a change](/docs/guides/prepare-a-change).

**Workspace** — The repository Prism is analysing, and the boundary it will not
read outside of.

**Zoom level** — Where the map is aggregated: repository, package, feature, file
or symbol. Each level re-aggregates rather than rescaling.
