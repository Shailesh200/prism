# Owner handoff — Prism website (M-054)

Everything below is **your** work in Vercel / DNS. The repo cannot do it.

Local preview of what shipped:

```bash
bun install
bun run docs:dev
# → http://localhost:3000
```

Useful routes: `/`, `/docs`, `/docs/cli/install`, `/docs/ide/install`,
`/docs/mcp/install`, `/features`, `/products`, `/whats-new`, `/admin`,
`/admin/docs`.

## 1. Vercel project

1. Vercel → Add New → Project → import `Shailesh200/prism`.
2. **Root Directory:** `apps/website`
3. Enable **Include files outside the root directory in the Build Step**
   (required — `docs/`, `CHANGELOG.md`, and workspace packages live at the
   monorepo root).
4. Framework: **Next.js**
5. **Install command:** `cd ../.. && bun install`  
   (also set in [`vercel.json`](./vercel.json))
6. **Build command:** `bun run build` (runs in `apps/website`; equivalent
   root script: `bun run docs:build`)
7. Output: leave Next.js default (no static `out/`)
8. Production branch: `main` (after this milestone merges). Keep Preview
   Deployments for PRs / `milestone/**` branches.

## 2. Environment variables

Vercel → Project → Settings → Environment Variables. Add for Production
(and Preview if you want `/admin` metrics on previews):

| Name | Required? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Yes (for correct sitemap / OG / RSS) | `https://www.prismhq.in` |
| `GITHUB_TOKEN` | Optional but recommended | Fine-grained PAT with public-repo read — higher GitHub API rate limits for `/admin` |
| `PRISM_AUTH_PUBLIC_ORIGIN` | Yes, for Dispatch OAuth | `https://auth.prismhq.in` |
| `PRISM_AUTH_SESSION_SECRET` | Yes, for Dispatch OAuth | Long random string; used to seal OAuth state/pickup blobs |
| `PRISM_AUTH_GOOGLE_CLIENT_ID` / `_SECRET` | Per connector you enable | Prism-owned Google OAuth web client. Redirect URI: `https://auth.prismhq.in/oauth/callback` |
| `PRISM_AUTH_GITHUB_CLIENT_ID` / `_SECRET` | Per connector | Same callback URI |
| `PRISM_AUTH_LINEAR_CLIENT_ID` / `_SECRET` | Per connector | Same callback URI |
| `PRISM_AUTH_JIRA_CLIENT_ID` / `_SECRET` | Per connector | Same callback URI |
| `PRISM_AUTH_SLACK_CLIENT_ID` / `_SECRET` | Per connector | Same callback URI |
| `PRISM_AUTH_NOTION_CLIENT_ID` / `_SECRET` | Per connector | Same callback URI |

No product telemetry keys. No Core secrets. Marketplace / Open VSX / npm
download counts are public APIs. Never put `PRISM_AUTH_*` secrets in the MCP
npm package.

Add **`auth.prismhq.in`** as a domain on this same Vercel project (same
deployment as `www`). `/oauth/start`, `/oauth/callback`, `/oauth/redeem`,
`/oauth/refresh`, and `/oauth/drivers` are the broker (ADR-0036).

## 3. Protect `/admin`

1. Project → Settings → Deployment Protection / Password Protection /
   Vercel Authentication (label depends on plan).
2. Prefer path-scoped protection for `/admin` if available so the public
   site stays open. If the plan only offers whole-deployment protection,
   password-protect previews and keep production public with `/admin`
   unlisted — still set a strong password / team SSO when you can.
3. After first deploy: private window → `/admin` should challenge; `/docs`
   should stay public.
4. Code already omits `/admin` from `sitemap.xml` and disallows it in
   `robots.txt`. Search only indexes the public docs source.

## 4. Custom domain

1. Buy the domain.
2. Vercel → Domains → add domain → copy A / CNAME / TXT records.
3. Paste at the registrar → wait for HTTPS (Vercel issues the cert).
4. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin → redeploy.

## 5. Optional polish

1. Enable **Web Analytics** on the Vercel project.
2. After go-live, update Marketplace / README homepage URLs (separate PR).
3. Share the `/admin` password or invite teammates to the Vercel team —
   never commit the password.

## 6. What you do *not* need to do

- Scaffold the Next.js app, rewrite docs, or wire Fumadocs — done in-repo.
- Add a GitHub Actions deploy for the site — Vercel Git integration is the path.
- Add in-product telemetry env vars — out of scope; privacy promise unchanged.
