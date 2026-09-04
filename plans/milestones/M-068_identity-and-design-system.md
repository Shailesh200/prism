# M-068 — Identity & Design System v3

| Field | Value |
|---|---|
| Status | **Planned** — blocked until M-067 is Verified and merged |
| Branch | `milestone/M-068-identity-design-system` (from latest `main`) |
| Depends on | M-067 (Shippable Product) |
| Unlocks | M-069 (Console UX Chassis), M-070 (Fleet Views) |
| Packages | `@repo-prism/ui`, `@repo-prism/app-shell`, `@repo-prism/dispatch-hub`, `apps/website`, `docs` |
| Adds | [ADR-0052](../adr/0052-product-identity-and-iris.md) (Iris + Spectrum), [ADR-0053](../adr/0053-console-information-architecture.md) (Console IA — §9 lands here) |
| Amends | [ADR-0014](../adr/0014-uxpilot-dark-product-ui.md), [ADR-0051](../adr/0051-motion-system.md) |
| Research | [`notes/COMPETITIVE_LANDSCAPE_2026-09.md`](../notes/COMPETITIVE_LANDSCAPE_2026-09.md) |

## 1. Goal

Give Prism the vocabulary and the primitives the next two milestones need, and
fix the token debt that would otherwise be inherited by every new surface.

This milestone deliberately ships **no new screens**. Its output is a name for
the thing that accumulates, a repaired token layer, four chart primitives, and
a website hero that is the product rather than a picture of it. M-069 builds
the chassis on top; M-070 builds the views.

Four problems it closes:

1. **The asset that compounds has no name.** Docs, tools, Console and owner
   use "the index", "Core", "Intelligence" and "the engine" interchangeably
   for the same thing. `@repo-prism/core` is a package boundary and
   `Intelligence` is a tool-group label; neither can be the subject of a
   sentence. ADR-0052 settles this as **Iris**.
2. **The token layer has a hole.** `--prism-accent` is referenced but never
   defined in `tokens.css`; `jobs-extra.css` falls back to a hardcoded
   `#38bdf8` for the job rail's current node. There is no ink or surface
   ladder, so `dispatch-hub/src/dashboard/styles.css` hardcodes `#ff9d9d`,
   `#47d18a` and `#13251c` inline. Adding three view renderings on top of this
   multiplies the drift.
3. **There are no chart primitives, but there are charts.** Hand-rolled SVG
   area and bar charts work today in `OverviewScreen.tsx` and
   `TrendsScreen.tsx` and are reachable only from the Playground and IDE. The
   Console needs the same shapes and currently has none, and ADR-0053 §9
   forbids solving that with a charting library.
4. **The website hero resembles the product.** `hero-constellation.tsx` is a
   decorative graphic; `RepositoryMapView` is the real thing. A hero that only
   looks like the product is a claim we cannot defend, which is the category
   M-056 and ADR-0029 legislate against.

## 2. Scope — five phases

One branch. Each phase is independently verifiable; run
`bun run verify:milestone` at every phase boundary.

| ID | Problem | Fix |
|---|---|---|
| **P-I1** | The accumulated knowledge has no product noun; copy has no rule for the one we chose. | Land Iris and Spectrum per ADR-0052: the aperture framing written into `DESIGN_SYSTEM.md` where copy is authored, the bounded definition and the substitution test, the no-first-person and no-avatar rules extended from ADR-0039, and `docs:check` taught both names so a half-finished sweep fails the gate. |
| **P-I2** | `--prism-accent` undefined; no ink/surface ladder; status hexes hardcoded across two stylesheets. | Define the accent ramp and remove the `#38bdf8` fallback; add `ink-1..4` and `surface-1..4`; migrate the hardcoded status colours in `styles.css` and `jobs-extra.css` onto semantic tokens; a test that fails on a raw hex in either stylesheet. |
| **P-I3** | Console needs chart shapes; the working SVG is trapped in two Playground screens; no library is permitted. | Extract `Sparkline`, `GanttRow`, `AreaChart` and `Gauge` into `@repo-prism/ui` from the existing hand-rolled SVG; `OverviewScreen` and `TrendsScreen` adopt them so there is one implementation; stated bundle delta with no new dependency. |
| **P-I4** | The marketing hero is a graphic that resembles the map. | Spectrum: the website hero renders a real repository through the real map model. One artifact, two surfaces. Server-rendered content per ADR-0051 §5 — the hero must be truthful without JavaScript. |
| **P-I5** | Loading and indexing have no shared motion language; ADR-0051 gave the vocabulary but nothing uses it for waiting. | One aperture/refraction loading motion applied to the three real waits — index building, queue draining, review computing — from the `@repo-prism/ui` motion vocabulary, CSS in the IDE and Console per ADR-0051 §2, zeroed under reduced motion. |

## 3. Out of scope

| Deferred work | Why / destination |
|---|---|
| Timeline / Board / List renderings | ADR-0053 §2–3; needs P-I3's primitives first → M-070 |
| `POST /api/jobs` and the compose surface | ADR-0053 §4; the largest UX fix, but it is chassis work → M-069 |
| Nav rail, command palette, `/` filter | ADR-0053 §8 → M-069 |
| Findings-to-job handoff | ADR-0053 §5 → M-069 |
| Cost and token persistence | ADR-0053 §9 forbids the chart before the metric → M-071 |
| Operator queue generalisation | ADR-0053 §6 → M-072 |
| findings → jobs → verify burndown loop | The payoff; needs M-069 and M-072 → M-073 |
| Renaming anything other than Iris and Spectrum | ADR-0052 §5 fixes the naming budget at two |
| An Iris icon or mark | ADR-0052 §1 permits one but nothing needs it yet; a mark drawn before a surface needs it will be drawn wrong |
| Light theme exposure in the Console | Tokens exist and are unreachable; not this milestone's problem |
| **M-062 (UI Actionability) reconciliation** | ADR-0053 consequences: its scope is a subset of §5/§8/§9. Owner decides absorb vs re-scope **before M-069 starts**, not here |

## 4. Definition of Done

- [ ] Only one milestone `In Progress`
- [ ] M-067 Verified and merged before this branch is cut
- [ ] ADR-0052 and ADR-0053 moved from `Proposed` to `Accepted`
- [ ] P-I1: aperture framing and the bounded definition in `DESIGN_SYSTEM.md`; no first-person Iris copy and no avatar on any surface; `docs:check` knows `Iris` and `Spectrum`
- [ ] P-I2: `--prism-accent` defined and the `#38bdf8` fallback deleted; ink and surface ladders exist; no raw hex in `dispatch-hub/src/dashboard/styles.css` or `app-shell/src/jobs-extra.css`, enforced by a test
- [ ] P-I3: four primitives in `@repo-prism/ui`; `OverviewScreen` and `TrendsScreen` render through them; no charting dependency added; bundle delta stated
- [ ] P-I4: the website hero renders a real repository through the map model; heading and content present with JavaScript disabled
- [ ] P-I5: one loading motion across index build, queue drain and review compute; zeroed under `prefers-reduced-motion`
- [ ] `bun run verify:milestone` green
- [ ] Hands-on check: Console, website and one IDE panel opened and looked at — the P-S7 lesson was that suites do not catch a blank page
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- [ADR-0052](../adr/0052-product-identity-and-iris.md) Iris names the aperture, not a persona
- [ADR-0053](../adr/0053-console-information-architecture.md) Console information architecture
- [ADR-0048](../adr/0048-prism-console-unification.md) Console unification — the surface this builds on
- [ADR-0051](../adr/0051-motion-system.md) Motion vocabulary (P-I5 spends it; §5 constrains P-I4)
- [ADR-0014](../adr/0014-uxpilot-dark-product-ui.md) UXPilot dark product UI — the tokens P-I2 repairs
- [ADR-0029](../adr/0029-signal-provenance.md) Signal provenance — why P-I4 cannot ship a hero that only resembles the product
- `plans/DESIGN_SYSTEM.md` — §2 already states the prism metaphor; P-I1 writes the rest
- `plans/UX_SIMPLICITY.md` — the complexity budget ADR-0053 §2 reconciles
- `plans/notes/COMPETITIVE_LANDSCAPE_2026-09.md` — the research that prompted all of it
