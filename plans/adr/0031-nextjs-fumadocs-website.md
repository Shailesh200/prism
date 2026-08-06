# ADR-0031: Next.js + Fumadocs public website (replace VitePress)

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-08-05 |
| Decision makers | Owner, Architect |
| Related milestones | **M-054** (implementation), M-038 (VitePress docs site) |
| Related | [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md), [ADR-0014](./0014-uxpilot-dark-product-ui.md) |

## Context

M-038 shipped a VitePress site over plain Markdown in `/docs`. That solved
"readable docs exist." It did not solve a public product home: landing,
what's new, features and products marketing, per-surface install lanes, or
a place for internal product review.

VitePress can host a custom theme, but marketing pages, an admin dashboard
fed by public APIs, and path-based protection sit more naturally in a
Next.js App Router app. The owner chose a full migrate rather than a
VitePress theme overlay or a dual Next.js-shell + VitePress mount.

## Decision

1. **One app:** `@repo-prism/website` at `apps/website` — Next.js 16 App
   Router + Fumadocs + Tailwind v4.
2. **Markdown stays at repo-root `docs/`.** Fumadocs reads it in place.
   Generated CLI/MCP reference scripts keep their paths. GitHub browsing
   and README relative links keep working.
3. **Dark-first theme** matching product UI tokens (`#0a0e1a`, `#00C2C2`,
   `#6C63FF`), with an optional light toggle. Light "Signal Chart" remains
   available via existing `[data-theme="light"]` tokens.
4. **Public docs lanes** (Docs / CLI / IDE / AI Agents) via Fumadocs root
   folders or explicit `DocsLayout` tabs. Architecture pages are served
   only under `/admin/docs`, not the public sidebar.
5. **Deploy on Vercel** with Git integration. No GitHub Pages. Custom
   domain is owner DNS work after first deploy.
6. **Drop VitePress** from the monorepo once the new site builds and
   `docs:check` is rewired to `meta.json`.

## Consequences

- `check-docs.mjs` validates `meta.json` trees instead of
  `docs/.vitepress/config.ts`.
- `apps/docs` stub is deleted; `@repo-prism/website` is the docs app.
- Old VitePress URLs redirect via `next.config` so Marketplace / README
  links do not 404.
- `/admin` relies on Vercel Deployment Protection (owner-configured), not
  obscurity. Public search, sitemap and robots exclude `/admin`.
- In-product telemetry remains out of scope (Q-010 / PRIVACY.md). The
  admin dashboard uses public Marketplace / npm / GitHub APIs only.

## Alternatives considered

| Option | Why not |
|---|---|
| Custom VitePress theme | Marketing + admin dashboard + dual content sources are awkward; owner chose full migrate |
| Next.js shell + VitePress at `/docs` | Two builds, duplicated chrome, rewrite routing |
| Move `docs/` into `apps/website/content/` | Breaks GitHub-first reading and more script rewires; kept as fallback if outside-root MDX fails |
