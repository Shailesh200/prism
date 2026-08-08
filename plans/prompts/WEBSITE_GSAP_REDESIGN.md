# Agent prompt — Prism marketing site GSAP redesign

Copy everything below the line into a new agent chat with workspace root
`/Users/shaileshjha/Prism` (or the Prism repo clone).

---

## Task

Redesign and implement GSAP-driven motion for the Prism **public marketing
site** at `apps/website`, using the same **mechanism** as the portfolio at
`/Users/shaileshjha/portfolio` (central `ensureGsap`, `@gsap/react` `useGSAP`,
`data-*` targets, `Reveal` / `PageEnter`, DrawSVG map scenes, reduced-motion
safety). Keep Prism’s locked brand — do **not** copy the portfolio’s lime /
Syne / instrument-HUD look.

## Locked decisions

1. **Scope:** all marketing pages — `/`, `/features`, `/products`,
   `/whats-new` (privacy/security get light `PageEnter` if cheap). Docs
   (`/docs/*`) keep Fumadocs chrome; do not fight the docs layout.
2. **Motion intensity:** cartographic subset only — map-draw hero ritual,
   scroll reveals, DrawSVG / MotionPath routes, soft `PageEnter`.
   **Omit:** entry gate, page wipe / channel switch, instrument HUD, WebGL
   particles, ambient SFX.
3. **Brand:** Signal Chart tokens in `plans/DESIGN_SYSTEM.md` and
   `apps/website/app/global.css` — navy canvas `#0a0e1a`, cyan `#00C2C2`,
   violet accent `#6C63FF`. Feeling: topographic map + flight instruments +
   code — not SaaS chat / purple glow.
4. **Process:** branch `milestone/M-055-website-motion` (or successor);
   follow `AGENTS.md` — no commits until the owner explicitly approves.

## Reference architecture (portfolio → Prism)

Read these portfolio files and port patterns, not visuals:

- `src/lib/gsap.ts` — `ensureGsap`, `prefersReducedMotion`, `safeSetVisible`,
  `killAndClear`
- `src/components/ui/Reveal.tsx`, `PageEnter.tsx`
- `src/components/showcase/HeroShowcase.tsx` — SplitText + DrawSVG +
  scoped `useGSAP`

Prism targets:

| Piece | Path |
|---|---|
| GSAP registry | `apps/website/lib/gsap.ts` |
| Primitives | `apps/website/components/motion/{Reveal,PageEnter}.tsx` |
| Hero scene | `apps/website/components/chart-hero-scene.tsx` (client) |
| Home | `apps/website/app/(home)/page.tsx` |
| Marketing | `apps/website/app/{features,products,whats-new}/page.tsx` |
| Tokens / CSS | `apps/website/app/global.css`, `app/layout.tsx` fonts |

Deps in `apps/website/package.json`: `gsap` ^3.15, `@gsap/react` ^2.1.

## Home composition (one job per section)

1. **Full-bleed chart hero** — brand mark + “Prism” as hero-level signal,
   one supporting sentence (“Turn a repository into terrain you can
   navigate.”), one CTA group + install chip. Map plane edge-to-edge (not
   an inset side card). Client scene: DrawSVG routes, node fade-in, one
   blast halo (once, not infinite glow).
2. **Terminal** — keep `TerminalDemo`; wrap with `Reveal`.
3. **Question-led** — keep copy from `QuestionLed`; stagger reveals; no
   card soup.
4. **Four surfaces** — instrument rows / hairline list, not a card grid.

## Marketing pages

Shared pattern: mono index · display title · one supporting line · content.
Use `PageEnter` + `Reveal`. Prefer hairline lists over rounded card grids
unless the card is the interaction container.

## Non-negotiable conventions

1. GSAP only inside `"use client"` components; call `ensureGsap()` first.
2. Guard every scene with `prefersReducedMotion()`.
3. Prefer `autoAlpha`; cleanup with `safeSetVisible` so HMR / route /
   theme toggle never leaves content invisible.
4. Target via `data-*` inside a scoped root (`useGSAP({ scope })`).
5. Native scroll only — no Lenis.
6. No purple-glow SaaS hero, no pill-stat strips in the first viewport,
   no emoji UI, no ambient particle networks.
7. Safety timeouts (~800–1200ms) on reveals; kill tweens + clear props on
   cleanup.

## Typography / atmosphere

- Geometric display face for marketing titles (e.g. Syne via `next/font`);
  keep JetBrains Mono for landmarks / meta. Reduce Inter on heroes.
- Atmosphere: cool mist + faint grid — refine existing CSS, no particles.

## Verification

```bash
bun install
bun run docs:dev
bun run docs:build
bun run docs:check
cd apps/website && bun run typecheck
```

Manual: `/`, `/features`, `/products`, `/whats-new`; toggle
`prefers-reduced-motion` and confirm content stays visible.

## Definition of done

- Marketing pages feel like one cartographic product.
- Reduced-motion path is static and fully readable.
- Build + typecheck green.
- No portfolio gate / wipe / HUD / particles / SFX.
- Prompt file remains accurate if you change the architecture.
