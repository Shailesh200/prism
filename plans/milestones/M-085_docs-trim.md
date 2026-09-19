# M-085 — Docs trim

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-085-docs-trim` |
| Depends on | M-084 Verified |
| Packages | `docs/`, website docs nav |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §5 M-085 |

## 1. Goal

Public docs match one product. Architecture long-form stays in `plans/`.

## 2. In scope

Keep: what-is, install, quickstart, understand-a-repo, dashboard, prepare-and-envelope, Jobs (rename `dispatch.md`), MCP/CLI reference, consent, limitations, FAQ. Unlink architecture pages. Drop playground-as-product.

## 3. Out of scope

Delete `plans/`. Website homepage / `/demo` (M-086).

## 4. Definition of Done

- [ ] `docs:check` + `docs:build` green
- [ ] Public nav matches the keep list
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Master Plan §8.1 + §9 + §10. No commits until the owner asks.

## 6. After merge

Open **M-086** (last) from `main`.
