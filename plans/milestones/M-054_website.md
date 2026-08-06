# M-054 — Public website + docs rewrite

| Field | Value |
|---|---|
| Status | **In Review** |
| Branch | `milestone/M-054-website` (from latest `main`) |
| Depends on | M-038 (docs content), M-039 (GA product) |
| Unlocks | Public product home, Vercel custom domain |
| Packages | `apps/website` (new); deletes `apps/docs` stub; retires VitePress |
| Decisions | [ADR-0031](../adr/0031-nextjs-fumadocs-website.md) |

## 1. Goal

Ship the public Prism website: marketing landing, what's new, features,
products, a task-first docs rewrite with per-surface lanes (CLI / IDE /
AI Agents), and a protected `/admin` area (architecture docs + adoption
dashboard from public APIs). Deploy to Vercel.

## 2. In scope

- Next.js 16 + Fumadocs + Tailwind v4 app at `apps/website`
- Dark-first theme using `@repo-prism/ui` tokens
- Docs IA rewrite: `start/`, `guides/`, `cli/`, `ide/`, `mcp/`, concepts
  collapse, dissolve `features/`, architecture only on `/admin/docs`
- Marketing: `/`, `/whats-new`, `/features`, `/products`
- Admin dashboard from Marketplace / Open VSX / npm / GitHub (no product
  telemetry)
- Redirects from old VitePress paths; rewire `docs:*` and `check-docs.mjs`
- Owner handoff checklist for Vercel project, env, protection, domain

## 3. Out of scope

- In-product usage telemetry (Q-010 remains closed)
- Buying / configuring the custom domain DNS (owner)
- Creating the Vercel project and Deployment Protection password (owner)
- Playground or extension UI changes

## 4. Definition of done

- [x] `apps/website` builds; `bun run docs:build` / `docs:check` green
- [x] `bun run verify:milestone` green
- [x] Cold start on `/docs`: install-for-surface, blast-before-edit, MCP
      setup, and health each answerable in under 30 seconds
- [x] `/admin` absent from sitemap / robots / public search; protection
      steps documented for owner
- [x] ADR-0031 Accepted; PROGRESS row In Review
- [x] Owner checklist delivered (Vercel import, env, domain)

## 5. Verification

```bash
bun run verify:milestone
bun run docs:dev   # manual: lanes, guides tabs, /admin locally
```
