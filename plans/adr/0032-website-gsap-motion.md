# ADR-0032: GSAP for Prism marketing-site motion

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-08-07 |
| Decision makers | Owner, Architect |
| Related milestones | **M-055** (implementation), M-054 (website) |
| Related | [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md), [ADR-0031](./0031-nextjs-fumadocs-website.md) |

## Context

M-054 shipped a Next.js + Fumadocs public site. Marketing pages were
structurally correct but static. The owner’s personal portfolio established
a proven GSAP stack (`ensureGsap`, `@gsap/react`, DrawSVG / SplitText,
safe visibility cleanup). We want that **mechanism** on Prism’s marketing
surfaces without importing the portfolio’s visual skin or heavy
ritual (boot gate, channel wipe, HUD, particles, SFX), which conflict with
Signal Chart motion guidance in DESIGN_SYSTEM.md.

## Decision

1. **GSAP** (`gsap` + `@gsap/react`) is the motion library for
   `apps/website` marketing pages.
2. Motion is a **cartographic subset**: hero map draw, scroll reveals,
   soft page enter. No entry gate, page wipe, instrument HUD, WebGL
   particles, or SFX.
3. **Docs stay Fumadocs** — motion primitives may be used lightly but must
   not rewrite the docs chrome.
4. Brand tokens remain those of ADR-0014 / DESIGN_SYSTEM (cyan signal on
   navy canvas). Portfolio lime/Syne instrument look is explicitly out.

## Options considered

### Option A — Framer Motion / CSS-only

- Pros: smaller API surface; no Club-plugin history.
- Cons: weaker SVG path draw / scrub patterns; diverges from the owner’s
  proven portfolio mechanism.

### Option B — Full portfolio ritual (gate + wipe + HUD + particles)

- Pros: maximum presence.
- Cons: fights DESIGN_SYSTEM (“no ambient particle networks”); wrong
  temperament for a local-first intelligence product; heavier bundle.

### Option C — GSAP cartographic subset (chosen)

- Pros: reuses proven helpers; matches map/route metaphor; reduced-motion
  safety already battle-tested in the portfolio.
- Cons: adds `gsap` weight to the marketing bundle (acceptable for
  marketing-only client islands).

## Consequences

- New client components under `apps/website/components/motion/` and a
  client chart hero scene.
- Agents should follow `plans/prompts/WEBSITE_GSAP_REDESIGN.md` for
  follow-up motion work.
