# Glossary

Terms that mean something specific in Prism.

**Band** — A risk score sorted into Low, Moderate or High. One definition,
shared by every surface. See [risk bands](../concepts/risk-bands.md).

**Blast radius** — Everything a change to one file or symbol could affect:
dependents, tests, features, and a risk band. See
[blast radius](../concepts/blast-radius.md).

**Churn** — How much an area has changed recently, from git history. Unavailable
without git, including in shallow clones.

**Confidence** — How much evidence agreed on an inference, as a percentage. Used
on features and stack detection. Low confidence means it is a guess.

**Consent purpose** — One named permission for one optional network or execution
capability, recorded in `.prism/consent.json`. There is no master switch. See
[consent and privacy](../concepts/consent-and-privacy.md).

**Dependency graph** — Files as nodes, imports as edges. The structural spine
that impact analysis is computed from. See
[dependency graph](../concepts/dependency-graph.md).

**DNA** — The identity of a repository: languages, frameworks, domains, and
conventions. Determines which domain screens appear. See
[repository DNA](../concepts/repository-dna.md).

**Domain** — A broad area of a repository: frontend, backend, data,
infrastructure. Detected, not configured. See [domain screens](../features/domains.md).

**Estimated** — Inferred rather than measured. Directionally useful; not precise.
Marked as such wherever it appears. See
[signal provenance](../concepts/signal-provenance.md).

**Feature** — A group of files that appear to implement one capability, inferred
from imports, naming and structure. Repositories do not declare these. See
[feature graph](../concepts/feature-graph.md).

**Hotspot** — High churn crossed with high complexity. The intersection is what
matters; neither metric alone identifies it.

**Index** — Prism's parsed copy of your repository, in `.prism/cache/index.sqlite`. Every
answer derives from it, which is why they all agree. See
[the repository index](../concepts/repository-index.md).

**Knowledge graph** — Semantic relationships beyond imports: what a symbol is,
what it relates to, what it belongs to. See
[knowledge graph](../concepts/knowledge-graph.md).

**Landmark** — A notable place in a repository — an entry point, a hub, a
boundary. What you would point at while explaining the codebase to someone new.

**Layer** — An overlay on the [map](../features/map.md) that colours structure by
one dimension: coupling, churn, tests, risk, ownership, features.

**Measured** — Read from real output rather than inferred. The counterpart to
estimated.

**MCP** — Model Context Protocol, the standard by which an AI client calls
external tools. Prism ships an MCP server. See [using MCP](../using/mcp.md).

**Orphan** — A file left dead because the only thing reaching it was deleted.
Reported by safe delete, and the reason safe delete is worth running.

**Provenance** — Whether a value was measured, estimated, or is unknown. See
[signal provenance](../concepts/signal-provenance.md).

**Surface** — A way of using Prism: the extension, the CLI, the MCP server, the
playground. All of them consume the same engine and compute nothing themselves.

**Unavailable** — Prism does not know this, and says so instead of showing zero.
A repository with no coverage report and one with genuinely zero coverage are
not the same repository.

**Workspace** — The repository Prism is analysing, and the boundary it will not
read outside of.

**Zoom level** — Where the map is aggregated: repository, package, feature, file
or symbol. Each level re-aggregates rather than rescaling.
