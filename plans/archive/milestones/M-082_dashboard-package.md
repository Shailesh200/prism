# M-082 — One Dashboard package

| Field | Value |
|---|---|
| Status | **Obsolete** (archived 17 Oct 2026) |
| Branch | `milestone/M-082-dashboard-package` |
| Depends on | M-081 Verified |
| Packages | new `dashboard`; shims from `ui`, `app-shell`, `dispatch-hub` |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §5 M-082 |


## Status (17 Oct 2026)

Obsolete. Focus Reset moved it into M-099. Then 2.0 deleted the dashboard packages outright instead of merging them (commit `f45ccb7`).

## 1. Goal

Mechanical UI merge. IDE webview and `:17330` serve the same entry. No engine rewrite.

## 2. In scope

`packages/dashboard/{primitives,screens,daemon}`. Thin or deleted playground host. One-major re-export shims.

## 3. Out of scope

Engine merge (M-083). Next.js inside this package. Website `/demo` import (M-086).

## 4. Definition of Done

- [ ] Daemon + IDE load the same Dashboard entry
- [ ] Playground is a thin host or gone
- [ ] Shims keep old imports compiling
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Master Plan §8.1 + §9 + §10. No commits until the owner asks.

## 6. After merge

Open **M-083** from `main`.
