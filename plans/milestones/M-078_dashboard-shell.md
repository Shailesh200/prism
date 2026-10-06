# M-078 — Dashboard shell (one rail, sanitize)

| Field | Value |
|---|---|
| Status | **In Review** |
| Branch | `milestone/M-078-dashboard-shell` (from latest `main` **after** sanity lands) |
| Depends on | M-077 Verified **and** `fix/mcp-console-dashboard-sanity` on `main` |
| Packages | `app-shell`, `dispatch-hub`, `ui`, `vscode-extension`, playground |
| Program | [PROGRAM_prism-2.0.md](./PROGRAM_prism-2.0.md) §9 |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §5 M-078 |

## 1. Goal

One Dashboard rail on daemon, playground, and IDE webview. Sanitize the face. Do not merge packages. Do not delete Core.

## 2. In scope

Implementation §5 M-078 A–J: nine-tab nav, unmount map, drop Domains UI, Trees on DNA, token chart on Trends, slim Jobs + Findings action, Integrations four cards, hash redirects. **One design system** (`packages/ui`). Prism tools before each file. Ask when two widgets exist.

## 3. Out of scope

Live Relay (M-079). Package merges. Deleting `getRepositoryMap` / `getDomainReport`. Website. Identity orgs.

## 4. Definition of Done

- [x] One nav on daemon + playground + IDE webview
- [x] No map mounted; no Domains UI; Trees on DNA; token chart on Trends
- [x] Jobs has Findings and no Pause/Cancel/Resume
- [x] Integrations has four cards; old hashes redirect
- [x] No new private Card / Empty / chart — all from `packages/ui` (or promoted into it)
- [x] Manual smoke (implementation §9)
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Same as every earlier phase (Master Plan §8.1 + §9 + §10): branch from `main` → working tree only → `verify:milestone` → owner review → commit when asked → local merge → Verified → what-changed snippet → next branch from `main`.

## 6. After merge

Open **M-079** from `main` (originally Jobs Live Relay; replaced 2026-10-06 by *Safety layer + Lenses*).
