# Phase 0 baseline (plan §9.6)

Recorded 2026-10-14 (IST) on `8b46042` (`milestone/M-087-focus-reset-plan`; checkpoint 2480b92 plus plan/format commits, no code change since). The machine is a MacBook Air (Apple M1, 8 GB RAM, macOS 26) running Node 24.18.1 and bun 1.3.11. Everything uses the local build (`bun run build`) and an isolated HOME (`/tmp/prism2/home`), except B1 and B9-medium, which ran with the real HOME.

| ID | File | Baseline | 2.0 target |
|---|---|---|---|
| B1 | B1-orientation.json | with Prism 41,931 est. tokens / 70 calls / 6,455 ms vs without 9,958 / 325 / 66 ms (4.2× more tokens with Prism) | with ≤ without |
| B2 | B2-prepare-eval.json | 163 tasks (mono 20, es-toolkit 40, hono 40, zod 40, rentmaadi 23): top-1 14.1%, top-3 17.2%, recall@pack 37.5%, tokens p50/p95 1,978/2,005 | top-3 ≥ 85%, recall ≥ E0+10 |
| B3 | B3-replay.json | catch 6/8 = 75%, false alarms 4/8 = 50%, median receipt 4.15 s | ≥ 6/7 (or 80% on ≥ 20), FA ≤ 5%, median ≤ 1.5 s |
| B4 | B4-golden.json | 172/220 tasks: top-1 12.2%, top-3 16.3%, recall@pack 43.3%, test P/R 14.3/58.4, blast P/R 9.0/17.9; held-out (33) top-3 15.2% | T7–T9 |
| B5 | B5-freshness.json | medium (11.8k files): edit→indexed p95 248 ms; edit→visible p95 2,346 ms; warm Prepare p95 1,956 ms; cold index 35.3 s | ≤ 300 ms; ≤ 1.0 s; ≤ 1.0 s |
| B6 | B6-agent-ab-2026-10-11.md | CC only, 33 runs/arm (copied, not re-run): tokens +28,571 with Prism, seconds −50, success +3 pp | tokens B−A ≤ 0 |
| B7 | B7-classifier.json | 400 English + 40 non-English (owner 72 + synthetic 368): change recall 0.738, question FP 0.125, non-English no-pack 0.95 | ≥ 0.95, ≤ 0.05, 1.0 |
| B8 | B8-hook-latency.json | es-toolkit: prompt p50/p95 548/5,711 ms; before-edit 179/295; after-edit 183/289; stop 9,451/10,837 | T2–T4 |
| B9 | B9-budgets-small.json, B9-budgets.json | small: within every budget (index_cold 310/3,500 ms) | no ceiling raised |
| B10 | B10-install-matrix.json | 0 cells pass: no `prism install`; R-A1 reproduced | T1 |

Labels for B2/B4 are mined from commits (`scripts/bench/golden/mine-tasks.mjs`). The first file is the one with the most changed lines, the tests are the changed test files, and the blast set is the other changed source files. These are lower bounds, so precision figures understate the true values. rentmaadi task files live in `~/.prism-dev/golden/` (private), and only its numbers are recorded here. Gate: `node scripts/bench/gate.mjs --current <dir>`.
