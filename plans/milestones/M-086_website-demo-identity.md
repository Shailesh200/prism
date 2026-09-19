# M-086 — Website + `/demo` + identity cutover (last)

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-086-website-demo-identity` |
| Depends on | M-085 Verified |
| Packages | `apps/website`, pairing gateway, publish names |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §4.7, §4.8, §5 M-086 |

## 1. Goal

Public storefront on `prismate.io`, product host on `app.prismate.io`, GitHub org `prismate`, npm `@prismate`. Demo `https://prismate.io/demo/<fixture>`. Pairing gateway on `/mcp` (not an indexer).

## 2. In scope

- Homepage hero uses the locked tagline + paragraph (PROGRAM §0.1). `/products`, `/features`, `/install`, `/demo/<fixture>` (fixture **named by the owner** — Q-024).
- Identity runbook (§4.8): buy/point domain, `app` DNS, GitHub org + transfer, npm org + first publish + deprecate `@repo-prism/*`, `prismhq.in` 301.
- Pairing gateway (§4.7) so `claude mcp add --transport http prism https://app.prismate.io/mcp/` reaches the local daemon.

## 3. Out of scope

Live-index of a visitor’s private tree. Inventing the fixture repo. `@prismate/ide` on npm. Reopening Options 2 / 4 / 6.

## 4. Definition of Done

- [ ] `https://prismate.io` serves the one-product site; hero is the locked tagline + paragraph
- [ ] `app.` `/mcp` `/cli` `/ide` resolve (pairing or documented challenge)
- [ ] GitHub `prismate/prism` is the canonical remote (after owner approval)
- [ ] `npx @prismate/{mcp,cli}` work; old names deprecated
- [ ] `/demo/<fixture>` click-path Overview → Iris → Impact (fixture name from owner)
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Master Plan §8.1 + §9 + §10. Domain/org steps are owner-ops in this same milestone, then the same review / commit / local merge / Verified / what-changed snippet as every earlier phase.

## 6. After merge

Prism 2.0 complete. Next work is only what the owner opens (M-058 / M-059 beside this program, or a new program).
