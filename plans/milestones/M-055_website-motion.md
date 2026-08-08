# M-055 — Website marketing motion (GSAP)

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-055-website-motion` (from latest `main`) |
| Depends on | M-054 (public website) |
| Unlocks | Polished marketing presence for prismhq.in |
| Packages | `apps/website` |
| Decisions | [ADR-0032](../adr/0032-website-gsap-motion.md) |
| Prompt | [plans/prompts/WEBSITE_GSAP_REDESIGN.md](../prompts/WEBSITE_GSAP_REDESIGN.md) |

## 1. Goal

Bring the portfolio’s GSAP **mechanism** (central registry, `useGSAP`,
safe reveals, DrawSVG map scenes) to Prism marketing pages with a
cartographic temperament — map-draw hero, scroll reveals, soft page enter —
without gate / wipe / HUD / particles / SFX.

## 2. In scope

- `gsap` + `@gsap/react` in `apps/website`
- `lib/gsap.ts` + `components/motion/{Reveal,PageEnter}`
- Home redesign: full-bleed chart hero scene + section composition
- Motion + layout polish on `/features`, `/products`, `/whats-new`
- Light `PageEnter` on `/privacy`, `/security`
- Display font for marketing titles; keep token system
- Reusable agent prompt under `plans/prompts/`

## 3. Out of scope

- Docs IA / Fumadocs theme rewrite
- Playground, IDE, CLI UI
- Portfolio-style entry gate, page wipe, instrument HUD, WebGL particles, audio
- Vercel / DNS (still owner per `OWNER_HANDOFF.md`)

## 4. Definition of done

- [x] Marketing pages share one cartographic motion language
- [x] `prefers-reduced-motion` shows static, fully visible content
- [x] `bun run docs:build` and `apps/website` typecheck green
- [x] `bun run docs:check` green
- [x] ADR-0032 Accepted; PROGRESS row updated
- [x] Prompt file usable standalone

## 5. Verification

```bash
bun install
bun run docs:dev
bun run docs:build
bun run docs:check
cd apps/website && bun run typecheck
```
