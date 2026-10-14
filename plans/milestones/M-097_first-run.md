# M-097 — First run in 60 seconds

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-097-first-run` (from latest `main`) |
| Depends on | M-096 Verified |
| Unlocks | M-098 |
| Packages | `cli` (default command, report card, `--badge`), `intelligence` (finding selection), `ui` (card image), `scripts/` (precision harness) |
| Absorbs | Parts of M-061 the precision gate needs |

## 1. Goal

`npx @repo-prism/cli` in any TS/JS repo shows a report card with three true, surprising findings, opens the graph, and points to the editor install, all within 60 seconds. Program §8.

## 2. In scope

| Item | Detail |
|---|---|
| Default command | No args: index with one-line progress, then card, then `graph.html` (`--no-open`), then the install hint for the detected editor |
| Report card | Stack, size, health and its three biggest factors, three findings (cycle / duplicate implementation / unused export / riskiest untested hotspot), each with path and "why this matters" |
| `--badge` | Local SVG badge plus card image in `.prism/`; nothing uploaded |
| Precision harness | `scripts/first-run-precision.ts` runs on 20 open-source TS/JS repos (list in `plans/notes/first-run-precision.md`); Claude Code triages each finding with the files as context; the owner confirms each label |
| Gate | Only finding types with ≥ 95% confirmed precision appear on the card |
| Time | ≤ 60s at 10k files on the M-035 reference machine, warm `npx` cache |

## 3. Out of scope

- Hosted badges or any upload. Non-TS/JS repos (the card says "not supported yet").

## 4. DoD

- [ ] Precision table recorded, owner-confirmed, gate applied
- [ ] Time budget met and recorded
- [ ] Card renders in an 80-column terminal and as an image
- [ ] CLI integration tests spawn the real binary on fixtures
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · `scripts/first-run-precision.ts` · manual run on three repos the owner names.
