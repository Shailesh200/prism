# M-077 — Prism 2.0

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-077-prism-2.0` (from latest `main`) |
| Depends on | M-076 Verified |
| Packages | none (docs / plan only) |
| Program | [PROGRAM_prism-2.0.md](../../milestones/PROGRAM_prism-2.0.md) |
| Implementation | [IMPLEMENTATION_prism-2.0.md](../../milestones/IMPLEMENTATION_prism-2.0.md) |
| ADR | [ADR-0057](../../adr/0057-prism-intelligence-unified-product.md) **Accepted** |

## 1. Goal

Lock **Prism 2.0**: one intelligence product, one Dashboard, fewer packages — on paper. First code is M-078.

## 2. In scope

- Mark ADR-0057 **Accepted** and the program **Approved** (owner 2026-09-19).
- Write the implementation plan (how, file-level sanitization, sequence).
- Rewrite Master Plan §3 to one product (not three SKUs / Map-as-hero).
- Lock public identity: `prismate.io`, `app.prismate.io`, GitHub `prismate`, npm `@prismate/{mcp,cli,core}`. Demo `/demo/<fixture>`. IDE Marketplace-only. See implementation §4.
- Lock hero copy (PROGRAM §0.1 / Q-027): kicker, tagline, paragraph. Design-system + Prism-before-each-file rule for M-078.
- Sequence lock: Live Relay = M-079; Marketplace = M-081; demo + identity cutover = M-086. Suggested HTTP pairing in implementation §4.7. Q-024 / Q-025 left open.
- `PROGRESS.md`: this row In Progress; Verified on merge. Milestone stubs M-078–M-086.

## 3. Out of scope

- Product code, package moves, MCP instruction edits, website rewrite.
- Live Relay (M-079, after the Dashboard shell).
- Landing `fix/mcp-console-dashboard-sanity` — **already on local `main`** (`92fa6b5`). Not this branch.

## 4. DoD

- [x] ADR-0057 Accepted
- [x] Program + implementation Approved
- [x] Master Plan §3 matches the rail
- [x] Public identity + hero copy locked (Q-026, Q-027)
- [x] Owner locked the plan (2026-09-19)
- [x] Owner approved commit (2026-09-19)
- [x] Docs gates green (`docs:check`, `check-plan-progress`); full `verify:milestone` flakes on pre-existing `health-history` in parallel
- [x] Master Plan §8.1 ritual: merged to local `main` 2026-09-19 → Verified

## 5. After merge

1. Mark this row **Verified**. Share a short what-changed snippet.
2. ~~Land `fix/mcp-console-dashboard-sanity`~~ **Done 2026-09-19** (`92fa6b5` on local `main`).
3. Open **M-078** from that `main`. That is the Dashboard shell (first product code).
