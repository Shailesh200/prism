# M-081 — Marketplace publisher rename

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-081-marketplace-publisher` |
| Depends on | M-080 Verified |
| Packages | `vscode-extension`, `cursor-extension`, publish CI |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §5 M-081 |

## 1. Goal

Publisher `prismhq.repo-prism` → **`prismate`** on VS Code Marketplace, Open VSX, and Cursor. IDE stays Marketplace-only (not npm).

## 2. In scope

`package.json` publisher / extension id, vsce / ovsx CI, README badges, transfer or deprecate the old listing.

## 3. Out of scope

`@prismate/ide` on npm. Website rewrite. GitHub/npm org creation (M-086). `/ide` page host (M-086 uses these ids).

## 4. Definition of Done

- [ ] VSIX builds under the new publisher
- [ ] Publish CI points at the new publisher
- [ ] Old listing deprecated or transferred
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Master Plan §8.1 + §9 + §10. No commits until the owner asks.

## 6. After merge

Open **M-082** from `main`.
