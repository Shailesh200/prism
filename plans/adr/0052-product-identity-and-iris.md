# ADR-0052: Iris names the aperture, not a persona

| | |
|---|---|
| Status | Proposed |
| Date | 2026-09-04 |
| Milestone | M-068 |
| Amends | [ADR-0014](./0014-uxpilot-dark-product-ui.md), [ADR-0039](./0039-dispatch-chat-voice.md) |
| Research | [`notes/COMPETITIVE_LANDSCAPE_2026-09.md`](../notes/COMPETITIVE_LANDSCAPE_2026-09.md) |

## Context

`DESIGN_SYSTEM.md` §2 already states the metaphor: *"Prism = light split into
spectrums → many views (architecture, deps, risk, ownership) of the same
codebase."* That is a precise description of the product, not a gesture, and
it is better than most names in this market. It has never been used past the
logo.

The gap it leaves is that **the thing which accumulates has no name.** Docs,
tool descriptions, the Console and the owner all reach for a different word
for the same asset — "the index", "Core", "Intelligence", "the engine",
"analysis". `@repo-prism/core` is a package boundary and `Intelligence` is the
name of a *tool group*; neither is a product noun, and one of them is a
directory. So the most valuable thing Prism owns — the durable, compounding
knowledge of a repository — is the one part of the product a user cannot name.

Trinity (ability.ai) makes the opposite choice and it is instructive. The
platform gets an abstract concept; the knowledge core gets a human name,
Cornelius. Users say "Cornelius found this" instead of "the knowledge base
returned a result", and that shift in language does real work. The competitive
note records the rest.

Copying that directly would break two rules we have written down.
`AGENTS.md` says Prism **is not** an AI coding assistant or LLM product.
`DESIGN_SYSTEM.md` lists "chat bubbles, agent avatars" and "chat-first
layouts" as explicit anti-patterns, and sets the emotional axis at
*instrument-grade trust*, "topographic map + flight instruments", against
"hype, magical, opaque". A personified mascot with an avatar and a first
person voice is the fastest possible route to becoming the thing we said we
are not.

The owner has chosen **Iris**. This ADR exists because the name is only safe
under one reading of it, and that reading has to be written down before the
first line of copy is drafted.

## Decision

### 1. Iris is the aperture of an optical instrument

An iris is the adjustable opening that controls what an instrument admits and
resolves. That reading sits *inside* the vibe `DESIGN_SYSTEM.md` already
locked — instruments, apertures, focus, resolution — rather than fighting it.
It is also literally what the component does: it decides what Prism looks at
and how sharply.

The rainbow-goddess reading is a coincidence and a liability. It is available
to anyone who wants it and must not appear in product copy, marketing, icons
or documentation. **No wings, no rainbow, no face, no eye.** If an Iris mark is
ever drawn it is a mechanical aperture: concentric leaves, hairline strokes,
the same 1.5–2px map-legend geometry as every other icon.

This is the whole basis on which the name is accepted. If copy drifts toward
the goddess, the name has failed and should be dropped rather than defended.

### 2. Iris has a bounded definition

Iris is **the accumulated, durable knowledge of a workspace.** Precisely:

- the index and its SQLite cache
- the dependency graph, semantic knowledge graph and feature graph
- repository DNA, landmarks and clusters
- health history and findings
- Dispatch memories written through `remember`

Iris is **not** the tools, the package, the process, or a single analysis run.
`repository_health` is a tool that *reads* Iris. `@repo-prism/core` is the
code that *maintains* Iris. A one-shot `blast_radius` call is not Iris doing
anything; it is a question answered from Iris.

The boundary matters because an unbounded product name becomes a synonym for
"our software" within two releases, at which point it carries no information.
The test: if a sentence still reads correctly with "the index and graphs"
substituted in, the usage is legitimate. If it only works as a vague gesture
at the whole product, it is wrong.

### 3. Iris never speaks in the first person

This extends ADR-0039 from Dispatch chat voice to product voice generally.

Iris is referred to the way infrastructure is referred to — "Iris has indexed
14,204 symbols", "Iris has no coverage data for this package", "Iris was last
refreshed 4 minutes ago" — exactly as one would say "Postgres has your data".

Never "I found", never "I think", never "let me look". No avatar anywhere in
any surface. No chat affordance, no bubble, no typing indicator, no greeting.
Iris has no opinions, because a knowledge base that volunteers opinions is the
black-box "AI said so" failure mode `DESIGN_SYSTEM.md` names directly.

The honesty rules already in force apply unchanged and are the reason the name
is worth having: Iris reporting that it does not know something is the most
valuable sentence it can produce.

### 4. Spectrum names the visualisation, and it is real

Prism's signature visual artifact is **the Spectrum** — the repository
rendered as structure. It is not a new component; it is a name for what
`RepositoryMapView` (`packages/ui`, `@xyflow/react`) already draws, plus the
marketing render that currently exists as the untracked
`apps/website/components/hero-constellation.tsx`.

**These must be the same artifact.** Trinity's single best move is the line
"pictured is not a mockup: it is Cornelius rendering its own mind" — the
marketing hero *is* the product. We are one step from that and should take it:
the website hero renders a real repository through the real map model, not a
decorative graphic that resembles one.

A hero that only resembles the product is a claim we cannot defend, which puts
it in the same category M-056 and ADR-0029 already legislate against. The
honest version is also the more impressive one.

### 5. The naming budget is exactly two names

Naming has downstream cost in docs, ADRs, tool descriptions, install copy and
marketing, and M-067 P-S5 already had to build a `docs:check` rule to catch
identifiers that outlived a rename. So the budget is fixed: **Iris and
Spectrum. Nothing else is renamed.**

Unchanged, deliberately: `Prism`, `Dispatch`, `Console`, `Findings`,
`Playbooks`, `Memories`, all 41 MCP tool names, all nine prompt names, every
package name, every ADR title.

`Dispatch` in particular earns its keep. It is a verb, it describes handing
work to a teammate, and it is already load-bearing in the plugin pack, the
statusline and the serif-italic wordmark. Renaming it to chase symmetry with a
competitor would cost a week and buy nothing.

### 6. `Core` stays the engineering word; `Iris` is the product word

They are not synonyms and the mapping is stated once, here: `@repo-prism/core`
is the SDK that builds and serves Iris. Code, ADRs, package docs and
architecture docs keep saying Core. User-facing surfaces — Console, website,
IDE panels, tool descriptions, CLI output — say Iris when they mean the
accumulated knowledge, and say nothing when they mean the package.

Architecture documents under `plans/architecture/` are engineering documents
and do not need rewriting for this ADR.

### 7. The worker is not named

Dispatch spawns Cursor's agent or Claude Code's agent depending on the host
(ADR-0044). Those are not ours to name, and naming someone else's agent as a
Prism persona would be both inaccurate and precisely the "AI assistant
product" positioning we have rejected.

The worker stays "the teammate" in chat voice and "the worker" in code. A
named worker is the single fastest way to turn Prism into a chat product, and
it is worth stating as a standing prohibition rather than rediscovering it.

## Consequences

- One word for the asset that compounds, which the product has lacked. "Iris
  has no data for that" is a sentence a user can learn, and it does honest
  work that "Intelligence is not loaded" does not.
- The website hero becomes a build dependency of the map model rather than an
  independent asset that can drift from it. That is the point, and it is also
  a real constraint on the website build.
- §1 is a permanent editorial obligation. Every future contributor will find
  the goddess reading before they find this ADR, so the aperture framing needs
  to be in `DESIGN_SYSTEM.md` where copy actually gets written, not only here.
- §2's boundary will be tested constantly and will need enforcement in review.
  The substitution test exists so the argument is short.
- Two names is two docs sweeps. `docs:check` should learn `Iris` and
  `Spectrum` so a half-finished rename fails the gate.

## Alternatives rejected

**Vera.** Recommended first, and a better fit on paper — *vera* means true,
Vera Rubin proved invisible structure exists by observing honestly, and the
whole culture of this repo is honest reporting. Rejected on owner taste, which
is the correct authority for a name. Worth recording that its justification
was stronger than Iris's default reading, which is why §1 has to carry so much
weight.

**Fresnel.** Optics-native, pairs tightly with Prism, and unmistakably an
instrument rather than a person. Rejected as hard to spell, hard to pronounce
outside a physics background, and bad in a URL.

**Mercator.** Fits the cartographic language `DESIGN_SYSTEM.md` already uses,
and `repository_map` plus `landmarks` are already his vocabulary. Rejected as
cold and slightly corporate; also carries projection-distortion baggage that
an accuracy-focused product should not invite.

**Keep "Intelligence".** Zero cost and zero risk. Rejected because it is a
tool-group label doing duty as a product noun, and because it cannot be the
subject of a sentence — the failure this ADR exists to fix.

**Name the whole platform something new.** Considered because Trinity's
abstract-platform-name pattern is what prompted the question. Rejected
immediately: `Prism` is on a marketplace listing, a domain, a published SDK at
1.0.0, and two extension packages. It also already means the right thing.

**Personify the worker as well** (Trinity ships Cornelius, Corbin and Ruby).
Rejected under §7 and under `AGENTS.md`. Prism is repository intelligence, not
a cast.
