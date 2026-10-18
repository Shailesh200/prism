# M-085 — Docs trim

| Field | Value |
|---|---|
| Status | **Absorbed** into M-090 and M-100 (archived 17 Oct 2026) |
| Branch | `milestone/M-085-docs-trim` |
| Depends on | M-084 Verified |
| Packages | `docs/`, website docs nav |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §5 M-085 |


## Status (17 Oct 2026)

Absorbed. The plans part was done in M-090 (archive, ADR index). The public docs part was done in M-100: `docs/` was rewritten for 2.0, with Envelope and the IDE removed (`docs:check` ok, 41 pages, per the 17 Oct implementation log).

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
