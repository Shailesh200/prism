# M-100 — Relaunch

| Field | Value |
|---|---|
| Status | **Built, not deployed**; owner review 18 Oct |
| Branch | `milestone/M-100-relaunch` (from latest `main`) |
| Depends on | M-099 Verified |
| Unlocks | next planning cycle |
| Packages | `README.md`, `docs/`, `apps/website`, `packages/vscode-extension` / `cursor-extension` (Marketplace listing text and images), `CHANGELOG.md` |
| Absorbs | M-063 distribution half, M-085 public docs, M-086 website + demo (identity part cancelled by ADR-0060) |


## Status (17 Oct 2026)

- **Done (local, not deployed):**
  - The website was rebuilt from the v6 design: hero, product pages, `/benchmarks`, `/install/<agent>`, a paginated `/changelog`, privacy and security pages.
  - SEO: `sitemap`, `robots`, `llms.txt` and structured data.
  - `docs/` was rewritten for 2.0 (`docs:check` ok, 41 pages).
  - Envelope, the IDE, JS/TS-only claims and Node-minimum claims were removed from the site and docs.
  - Install snippets use `npx -y @repo-prism/mcp-server@2`.
- **Dropped:** the Marketplace listing (extensions deleted) and `/demo/<fixture>` (out of scope for 2.0, unified plan C-13).
- **Open:**
  - `README.md` was updated on 17 Oct. Its hero image still shows the old line.
  - The deploy waits for the owner's review on 18 Oct, after the 2.0.0 release gate.
  - Nothing is pushed or deployed.

## 1. Goal

Prism presents as what it now is: faster agent sessions and fewer broken builds, with proof. Program §4.5 public docs, §1.1 claim rule.

## 2. In scope

| Item | Detail |
|---|---|
| Hero numbers | If M-098 supports them (CI excludes zero), add measured numbers to the sub-line. Otherwise revisit the hero with the owner before shipping |
| README | One screen: hero, the 60-second first run, install, three images (receipt, graph, ~~Envelope card~~) |
| Docs | Seven pages: What Prism is, Install, Prepare, ~~Envelope~~, Graph, Receipt, CLI reference. The rest archived |
| Website | Home with the hero; `/benchmarks` from M-098; `/demo/<fixture>` static Graph + receipt + report card from one named open-source repo (Q-024: owner names it) |
| Marketplace | `prismhq.repo-prism` listing text and screenshots updated (publisher unchanged) |
| npm | Package READMEs aligned; version bump plan written. Publishing only on owner request |
| CHANGELOG | One entry summarising M-088 → M-099 |

## 3. Out of scope

- Any rename (cancelled). Publishing or pushing without an explicit owner request.

## 4. DoD

- [ ] Copy test (banned words) green; claims only where M-098 supports them
- [ ] `docs:check` and `docs:build` green with seven pages
- [ ] Website builds; `/benchmarks` and `/demo/<fixture>` render offline-capable static content
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · website build · manual review of README, home, `/benchmarks`, `/demo`.
