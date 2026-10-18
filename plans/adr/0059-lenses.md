# ADR-0059: Lenses — user-owned review lenses, thought by the host's model

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-06) |
| Date | 2026-10-06 |
| Milestone | [M-079 Safety layer + Lenses](../archive/milestones/M-079_safety-layer.md) phases 4, 5, 7 |
| Amends | [ADR-0052](./0052-product-identity-and-iris.md) §7 (“the worker is not named”), [ADR-0057](./0057-prism-intelligence-unified-product.md) §6 (“no worker persona”) |
| Depends on | [ADR-0058](./0058-prism-does-not-run-agents.md) |

## Context

The owner wants reviewers that look at a task or change from one angle — Architect, QA, Dev — that are customisable, remember what they learned, and are inspectable, in the spirit of the council skill and of raft.build's named agents with their own memory and verifiable review gates.

Two standing rules forbid a naive version. ADR-0052 §7: naming the worker turns Prism into a chat product. ADR-0057 §6: no new product nouns, no worker persona. Both rules guard the same thing: Prism is not an AI assistant and does not run a model.

A lens can respect both. It is not a worker and not Prism's character. It is a user-owned definition plus evidence; the host's own model does the thinking.

## Decision

### 1. Name

Feature: **Lenses**. One is *a lens* (“the QA lens”); using them is *reviewing with lenses*. Lenses takes the vocabulary slot Jobs vacates (ADR-0058 §6). Default lenses use **role names** — Architect, QA, Dev. The user may rename any lens; Prism never invents human names.

### 2. Prism calls no model

A lens runs as an independent **host subagent**. Prism supplies the brief (definition + memory + evidence pack) and records the verdict. Where a host has no subagents, lenses run one after another in the same context, and the output says so.

### 3. A lens is data the user owns

| Part | Content |
|---|---|
| Definition | Editable markdown + frontmatter: name, role, focus, tone, **checklist of verifiable claims** (each provable from Prism data or a command, never an adjective) |
| Evidence | Which Prism reads feed it (Architect → boundaries, cycles, ADR `rationale_for`, off-limits; QA → `test_impact`, verify plan, test layout; Dev → reuse, House Style, duplicate findings) |
| Memory | Facts tagged *seeded* / *learned* / *user*; stored in the existing `remember` store with a lens scope |
| History | Per review: evidence given, reasoning the host returned, verdict, owner override |

Stored privately under `~/.prism/workspaces/<key>/lenses/`. Never written into the repository.

### 4. Seeded from the index

After the first index, Prism seeds the three defaults from repo facts (stack, packages, ADRs, detected test commands, House Style). Re-seeding replaces *seeded* facts only. An owner override becomes a *learned* fact, so the same false alarm does not return.

### 5. When lenses run

On demand (`review_with`), plus an optional pass inside the stop-hook change receipt (ADR-0058 §2). Never after every edit.

### 6. Surface

At most two MCP tools: `review_with` (e.g. `review_with: ["architect", "qa"]`) and `lens` (list / show / edit / seed). No per-lens tools. Both count inside the ~5-tool budget.

### 7. Transparency

A Lenses view (Dashboard + MCP App) shows each lens's definition, memory by origin, evidence per review, and verdict history. Prism shows the reasoning a lens *wrote* and the evidence it *saw* — not the model's hidden thinking.

## Consequences

- Positive: users route review by angle; corrections accumulate per lens; checklists keep verdicts falsifiable.
- Negative: three lenses cost roughly three times the tokens and time of one review; host subagent support varies.
- Positioning risk managed by wording: lenses are views the user owns, not a teammate Prism plays.

## Alternatives rejected

**Prism calls an LLM per lens.** Rejected: breaks “not an LLM product”, needs keys.

**Human-style default names (Raft).** Rejected: the named-assistant positioning ADR-0052 forbids. Users may name their own.

**Lens files committed in the repo.** Rejected for v1: Prism never writes into the repo (ADR-0057 / agents_md rule). Team sharing can be revisited later.

**Raft-style runtime (lenses claim tasks, hand off work).** Rejected: that is a job runner (ADR-0058).

**Lenses on every edit.** Rejected: cost and noise.

**Names considered and not used:** Council (clashes with the council skill), Spectrum (retired), Crew / Agents / Team (imply they do the work), Facets (reads as search filters), Reviewers (no brand, limits future use).

## Compliance

- [x] Owner accepts this ADR (2026-10-06)
- [x] ADR-0052 §7 and ADR-0057 §6 annotated with a pointer here
