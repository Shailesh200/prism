# GSAP usage audit — read-only

Repository: **prism** (root `package.json` name `prism`; packages published as `@repo-prism/*`;
git remote `github.com/Shailesh200/prism.git`). No files were modified for this audit.

GSAP appears in exactly two apps/packages: **apps/website** (the marketing/docs site) and
**packages/dispatch-hub** (the Console/Hub dashboard). `packages/ui` and `packages/app-shell`
deliberately avoid GSAP (see ADR-0051) so it doesn't leak into the IDE webview bundle.

## apps/website — GSAP core module

- `apps/website/lib/gsap.ts` — imports `gsap`, `gsap/ScrollTrigger`, `gsap/SplitText`,
  `gsap/DrawSVGPlugin`, `gsap/ScrollToPlugin`. Registers those four plugins once via
  `ensureGsap()`. Also exports `prefersReducedMotion()`, `onReducedMotionChange()`,
  `safeSetVisible()`, `killAndClear()` — the shared reduced-motion + cleanup helpers every
  component below builds on. MotionPath and Flip are explicitly *not* registered (comment:
  only plugins something on the site actually tweens are bundled).

## apps/website — components using GSAP directly

| File | GSAP APIs | Animates |
|---|---|---|
| `components/motion/RouteLoader.tsx` | core `timeline()` | Top progress bar across a route change |
| `components/motion/CustomCursor.tsx` | core `quickTo`, `set`, `to`, `killTweensOf` | Custom cursor dot + trailing ring following the pointer |
| `components/motion/StaggerGrid.tsx` | core `fromTo` + `useGSAP` (`@gsap/react`) + `ScrollTrigger` | Grid/list items fade+slide in, staggered, on scroll |
| `components/motion/hash-scroll.ts` | core `to` + `ScrollToPlugin` | Smooth scroll to same-page hash anchors |
| `components/motion/Counter.tsx` | core `to` + `useGSAP` + `ScrollTrigger` | Numeric counter tweening 0 → value on scroll into view |
| `components/motion/Magnetic.tsx` | core `quickTo`, `utils.clamp`, `killTweensOf` | Primary CTA leaning toward the pointer |
| `components/home-hero.tsx` | core `timeline`, `set` + `useGSAP` + `SplitText` | Hero entrance: mark, char-split title, sub, meta, actions, install panel |
| `components/motion/Reveal.tsx` | core `fromTo` + `useGSAP` + `ScrollTrigger` | Generic scroll reveal (fade + slide) used across marketing sections |
| `components/motion/PageEnter.tsx` | core `fromTo` + `useGSAP` | Soft fade-in wrapper on mount / route change |
| `components/chart-hero-scene.tsx` | core `timeline`, `set` + `useGSAP` + `DrawSVGPlugin` | Animated hero SVG: path draw-on, node/label/badge fade, halo pulse |

`components/motion/use-reduced-motion.ts` has no direct GSAP tween — it's a React hook wrapping
`lib/gsap.ts`'s `prefersReducedMotion` / `onReducedMotionChange`.

## apps/website — components that use GSAP only indirectly (via the table above)

- `components/motion/MotionChrome.tsx` — composes `RouteLoader` + `CustomCursor` +
  `installHashScroll`; mounted once in `app/layout.tsx` (site-wide chrome).
- `components/motion/SectionIntro.tsx` — wraps `Reveal` for page section headers.
- `components/question-led.tsx` — uses `Reveal` (home page "three questions" section).
- `components/surfaces-strip.tsx` — uses `Reveal` (home page "every surface" section).
- `components/chart-hero-visual.tsx` — deprecated re-export alias of `ChartHeroScene`.

## apps/website — pages, grouped by which GSAP-backed components they pull in

- `app/layout.tsx` → `MotionChrome` (site-wide: route loader + custom cursor)
- `app/(home)/page.tsx` → `PageEnter`, `Reveal` (plus `HomeHero`, `SurfacesStrip`,
  `QuestionLed` transitively)
- `app/products/page.tsx` → `PageEnter`, `Reveal`, `StaggerGrid`, `SectionIntro`
- `app/features/page.tsx` → `PageEnter`, `StaggerGrid`, `SectionIntro`
- `app/benchmarks/page.tsx` → `PageEnter`, `Reveal`, `SectionIntro`, `Counter`
- `app/whats-new/page.tsx` → `PageEnter`, `Reveal`, `StaggerGrid`, `SectionIntro`
- `app/whats-new/[slug]/page.tsx` → `PageEnter`
- `app/admin/page.tsx` → `Counter`, `PageEnter`
- `app/security/page.tsx` → `PageEnter`
- `app/privacy/page.tsx` → `PageEnter`

## packages/dispatch-hub (Console/Hub dashboard)

- `src/dashboard/job-rail-motion.ts` — imports `gsap` directly (core `fromTo`, `from`).
  Animates the job lifecycle rail: fill bar growing across four rungs, plus a
  scale/opacity-in for reached step nodes. Consumed by `src/dashboard/console-app.tsx` via
  the `useJobRailMotion(root, signature)` hook. `gsap` is a **devDependency** here, bundled
  into the dashboard bundle at build time (`scripts/build-dashboard.ts`), not a runtime
  dependency of the published `@repo-prism/dispatch-hub` package.

## packages/ui and packages/app-shell — no GSAP (by design)

- `packages/ui/src/motion.ts` — no GSAP import. Deliberately CSS-only per ADR-0051; exports
  `PRISM_DURATION`, `PRISM_EASE`, `staggerStep()`, `prefersReducedMotion()`,
  `motionDuration()`. Comment explains a GSAP dependency here would add ~70 kB to the IDE
  webview bundle, which imports this module too. `staggerStep()` is reused by
  `apps/website/components/motion/StaggerGrid.tsx` for its stagger timing.
- `packages/app-shell/src/jobs-extra.css` — no GSAP code. Two comments reference GSAP only
  to contrast: this file's job-rail fill is CSS-only (for the IDE webview), unlike
  `dispatch-hub`'s GSAP-driven version of the same rail.

## Dependency declarations

- `apps/website/package.json` → `"gsap": "^3.15.0"` (dependency), `"@gsap/react": "^2.1.2"` (dependency)
- `packages/dispatch-hub/package.json` → `"gsap": "^3.15.0"` (devDependency)

## Plugins/APIs used across the repo

`gsap` core, `ScrollTrigger`, `SplitText`, `DrawSVGPlugin`, `ScrollToPlugin`, and
`@gsap/react`'s `useGSAP` hook. `MotionPath` and `Flip` are not used anywhere.
