# M-088 — Prism identity + hero copy

| Field | Value |
|---|---|
| Status | **Done**, not owner-verified |
| Branch | `milestone/M-088-identity-hero-copy` (from latest `main`) |
| Depends on | M-087 Verified |
| Unlocks | M-089 |
| Packages | `README.md`, root `package.json`, every package `package.json` `description`, `apps/website`, `packages/mcp-server` (`branding.ts`), `packages/app-shell`, `packages/dispatch-hub` (copy strings only), `AGENTS.md`, `CLAUDE.md`, `plans/PRD.md`, `plans/architecture/01_HLD.md` |
| ADR | [ADR-0060](../adr/0060-prism-keeps-its-name.md) |


## Status (17 Oct 2026)

- **Done:**
  - Prismate is gone from code. The only hit left is the banned-word check in `mcp-server/src/branding.test.ts`.
  - The website hero, SEO, OG image and `llms.txt` use the new line: "Your agent's second pair of eyes. Know before you ship." (`apps/website/lib/seo.ts`). That line replaced "Faster agent sessions. Fewer broken builds." (ADR-0060 / Q-7) on 16–17 Oct.
  - The hero features are Prepare and Lens Review.
- **Done later on 17 Oct:**
  - `README.md` now uses the new headline and intro. It has no TS/JS-only claim, no Node minimum, and the published install form.
  - The root, `cli`, `mcp-server` and `intelligence` package descriptions are updated.
  - ADR-0060 now has a hero-line amendment.
- **Left:**
  - The MCP server's own description in `mcp-server/src/branding.ts` still says "Local context and change checks for coding agents." A test pins it, and the round 4 worker is editing that package.
  - The README hero image (`assets/readme-hero-*.png`) still shows "Help your AI agent get it right."
- Not verified by the owner.

## 1. Goal

The product is called Prism everywhere, and every surface says what it does for developer speed. The owner asked for this now (D1, D2), so it goes first. Copy only.

## 2. In scope

| Item | Detail |
|---|---|
| Remove Prismate | The 9 UI source files (`packages/app-shell/src/*` ×8, `packages/dispatch-hub/src/dashboard/prepare-history.tsx`) plus their tests. Plans referencing Prismate as the future name get a one-line "cancelled by ADR-0060" note; history is not rewritten. |
| Hero | Program §1.1: "Faster agent sessions. Fewer broken builds." (or the owner's pick), the sub-line, and the kicker. Applied to the README top, the website home hero, `opengraph-image.tsx` text, and `lib/seo.ts` title / description. |
| Category line | "Local context and change checks for coding agents." replaces "Local-first Software Intelligence Engine" in root and package `description` fields, `branding.ts`, `AGENTS.md`, `CLAUDE.md`, the PRD summary and the HLD summary. |
| Banned words | Copy test (extend `branding.test.ts`): no "Prismate", "teammate", "AI-powered", "intelligent", "magic" in shipped strings. |
| Identity lock | `@repo-prism/*` npm, `prismhq.repo-prism` Marketplace, `prismhq.in`, GitHub `Shailesh200/prism`. Written into ADR-0060 and Master Plan §3.3. |

## 3. Out of scope

- No numeric claims (they wait for M-098).
- No docs restructure (M-100). No tool or behaviour changes.
- No Marketplace or npm publish.

## 4. DoD

- [ ] `rg -i prismate` returns only plans history and ADR-0060
- [ ] The hero line and category line match program §1.1 on README, website home, SEO, OG image, MCP branding, and package descriptions
- [ ] The banned-words copy test passes
- [ ] Website builds; README renders on one screen above the fold
- [ ] `verify:milestone` green (or M-078's Node failure recorded as pre-existing)
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · `bun run --cwd apps/website build` · manual look at the README and the website home in a browser.
