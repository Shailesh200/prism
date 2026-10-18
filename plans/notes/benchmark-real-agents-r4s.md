# Real-agent proof

Generated 2026-10-17T08:21:14.859Z. Host claude, model claude-sonnet-5-5. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### followup (9 A / 9 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 9/9 | 9/9 |
| Blind grade, correctness (1–5) | 4.00 | 3.44 |
| Blind grade, minimal code (1–5) | 4.00 | 3.00 |
| Blind grade, house style (1–5) | 3.67 | 3.33 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 3–5 of 9 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 0.75 |
| Sessions that added a new source file | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 1/9 | 0/9 |
| Sessions breaking a nearby test that passes upstream | 0/9 | 0/8 |
| Sessions that read outside the checkout or its history | 1 | 1 |

| Turn | A pass | B pass | A tokens, median | B tokens, median | B Prism text, median chars |
|---|---|---|---|---|---|
| 1 | 5/9 | 5/9 | 243,972 | 204,020 | 1510 |
| 2 | 8/9 | 8/9 | 120,623 | 139,856 | 645 |
| 3 | 5/5 | 5/5 | 155,632 | 136,978 | 0 |

### Review set: planted problems found

Each task is a correct maintainer fix with 1–2 problems planted (a bug, a copied helper, unused new API, a style break, a design or speed problem). Found = a finding on the planted lines (±3). Precision counts a finding as right when it is on a planted problem or the blind grader calls it a real problem.

| Arm | Sessions | Planted problems found | All found | Findings per review | Precision, planted only | Precision, with grader | Edited files |
|---|---|---|---|---|---|---|---|
| No help | 3 | 5/6 (83%) | 2/3 | 3.3 | 70% | 70% | 0 |
| Prism, lens automatic | 3 | 5/6 (83%) | 2/3 | 5.3 | 50% | 69% | 0 |

| Found, by kind | No help | Prism, lens automatic |
|---|---|---|
| bug | 2/3 | 2/3 |
| reuse | 1/1 | 1/1 |
| style | 0/0 | 0/0 |
| minimal | 0/0 | 0/0 |
| design | 1/1 | 1/1 |
| perf | 1/1 | 1/1 |

## Cost

Small set (the earlier es-toolkit + hono tasks), B − A with a 95% bootstrap interval:

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 0 | 0 | |
| Success | 0% | 0% | 0.0 pp (0.0 to 0.0) |
| Tokens, mean | 0 | 0 | 0 (0 to 0) |
| Seconds, mean | 0 | 0 | 0 (0 to 0) |
| USD, mean | 0.00 | 0.00 | 0.00 (0.00 to 0.00) |
| Tokens, median | 0 | 0 | |
| Sessions calling a Prism tool | | 0/0 | |

Medians per set and arm:

| Set | Per arm |
|---|---|
| followup | A: 400,554 tok, $0.145, 48 s; B: 383,738 tok, $0.162, 72 s |
| review | A: 66,430 tok, $0.055, 12 s; B: 69,701 tok, $0.062, 15 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| es-toolkit-15043d8e | followup | A | 1 | yes | 38 | 227,830 | +2/−1 | 1.00 |  |
| review-hono-etag | review | B | 1 | yes | 14 | 68,571 | 2/2 found | – |  |
| review-hono-combine | review | B | 1 | no | 15 | 69,701 | 1/2 found | – |  |
| review-es-toolkit-meanBy | review | A | 1 | yes | 12 | 73,622 | 2/2 found | – |  |
| review-hono-etag | review | A | 1 | yes | 12 | 65,062 | 2/2 found | – |  |
| review-es-toolkit-meanBy | review | B | 1 | yes | 16 | 76,963 | 2/2 found | – |  |
| review-hono-combine | review | A | 1 | no | 13 | 66,430 | 1/2 found | – |  |
| hono-b20d4225 | followup | B | 1 | yes | 42 | 311,197 | +4/−4 | 0.31 |  |
| es-toolkit-8f557cb3 | followup | A | 1 | yes | 43 | 370,450 | +6/−6 | 1.00 |  |
| es-toolkit-ea692b9f | followup | A | 1 | yes | 203 | 1,123,158 | +14/−20 | 0.65 |  |
| es-toolkit-2c4c0478 | followup | A | 1 | yes | 47 | 400,554 | +4/−2 | 1.00 |  |
| hono-b20d4225 | followup | A | 1 | yes | 46 | 387,415 | +4/−4 | 0.31 |  |
| es-toolkit-e62aa15f | followup | B | 1 | yes | 67 | 380,364 | +3/−0 | 1.00 | left the sandbox |
| hono-7a254bc0 | followup | A | 1 | yes | 97 | 743,434 | +37/−3 | 1.21 |  |
| es-toolkit-2c4c0478 | followup | B | 1 | yes | 62 | 383,738 | +6/−4 | 1.67 |  |
| es-toolkit-3433044c | followup | B | 1 | yes | 260 | 1,306,134 | +4/−6 | 0.28 |  |
| hono-3d8abbc2 | followup | B | 1 | yes | 64 | 309,942 | +25/−3 | 0.52 |  |
| es-toolkit-15043d8e | followup | B | 1 | yes | 86 | 295,060 | +2/−1 | 1.00 |  |
| es-toolkit-8f557cb3 | followup | B | 1 | yes | 72 | 455,689 | +20/−14 | 2.83 |  |
| es-toolkit-ea692b9f | followup | B | 1 | yes | 517 | 1,082,661 | +14/−25 | 0.75 |  |
| hono-7a254bc0 | followup | B | 1 | yes | 118 | 473,023 | +5/−0 | 0.15 |  |
| hono-3d8abbc2 | followup | A | 1 | yes | 48 | 233,969 | +35/−17 | 0.96 |  |
| es-toolkit-3433044c | followup | A | 1 | yes | 254 | 1,124,822 | +2/−2 | 0.11 |  |
| es-toolkit-e62aa15f | followup | A | 1 | yes | 93 | 704,294 | +6/−2 | 2.67 | left the sandbox |
