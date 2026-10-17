# Real-agent proof

Generated 2026-10-16T07:20:17.487Z. Host agent, model grok-4.7-high. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### bigger (4 A / 3 B / 2 L sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) | Arm L (Prism, Architect lens named) |
|---|---|---|---|
| Correct: the failing tests pass, tests untouched | 4/4 | 3/3 | 2/2 |
| Blind grade, correctness (1–5) | 5.00 | 5.00 | 3.50 |
| Blind grade, minimal code (1–5) | 4.67 | 4.67 | 4.00 |
| Blind grade, house style (1–5) | 4.33 | 4.33 | 3.50 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 0–0 of 3 | 0–1 of 2 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 1.00 | 0.52 |
| Sessions that added a new source file | 0 | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 0/4 | 0/3 | 0/2 |
| Sessions breaking a nearby test that passes upstream | 0/4 | 0/3 | 0/2 |
| Sessions that read outside the checkout or its history | 0 | 0 | 0 |

### followup (2 A / 2 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 2/2 | 2/2 |
| Blind grade, correctness (1–5) | 5.00 | 5.00 |
| Blind grade, minimal code (1–5) | 4.50 | 4.50 |
| Blind grade, house style (1–5) | 4.50 | 4.50 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 0–0 of 2 |
| Change size vs the maintainers' fix, median (1.00 = same) | 0.81 | 0.89 |
| Sessions that added a new source file | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 0/2 | 0/2 |
| Sessions breaking a nearby test that passes upstream | 0/2 | 0/2 |
| Sessions that read outside the checkout or its history | 0 | 0 |

| Turn | A pass | B pass | A tokens, median | B tokens, median | B Prism text, median chars |
|---|---|---|---|---|---|
| 1 | 1/2 | 1/2 | 1,164,015 | 2,440,646 | 0 |
| 2 | 2/2 | 2/2 | 509,991 | 610,539 | 0 |
| 3 | 2/2 | 2/2 | 609,644 | 713,788 | 0 |

### Review set: planted problems found

Each task is a correct maintainer fix with 1–2 problems planted (a bug, a copied helper, unused new API, a style break, a design or speed problem). Found = a finding on the planted lines (±3). Precision counts a finding as right when it is on a planted problem or the blind grader calls it a real problem.

| Arm | Sessions | Planted problems found | All found | Findings per review | Precision, planted only | Precision, with grader | Edited files |
|---|---|---|---|---|---|---|---|
| No help | 4 | 3/7 (43%) | 1/4 | 1.0 | 75% | 100% | 0 |
| Prism, lens automatic | 1 | 1/2 (50%) | 0/1 | 1.0 | 100% | 100% | 0 |
| Prism, lens named | 1 | 1/2 (50%) | 0/1 | 1.0 | 100% | 100% | 0 |

| Found, by kind | No help | Prism, lens automatic | Prism, lens named |
|---|---|---|---|
| bug | 1/4 | 0/1 | 0/1 |
| reuse | 1/1 | 0/0 | 1/1 |
| style | 0/1 | 0/0 | 0/0 |
| minimal | 0/0 | 1/1 | 0/0 |
| design | 1/1 | 0/0 | 0/0 |
| perf | 0/0 | 0/0 | 0/0 |

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
| bigger | A: 1,328,142 tok, $0.000, 316 s; B: 1,455,138 tok, $0.000, 294 s; L: 1,175,438 tok, $0.000, 275 s |
| followup | A: 2,283,649 tok, $0.000, 780 s; B: 3,764,972 tok, $0.000, 679 s |
| review | A: 979,395 tok, $0.000, 607 s; B: 943,377 tok, $0.000, 541 s; L: 347,011 tok, $0.000, 317 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| es-toolkit-ea692b9f | bigger | L | 1 | yes | 336 | 1,350,842 | +17/−21 | 0.73 |  |
| review-es-toolkit-intersectionBy | review | B | 1 | no | 541 | 943,377 | 1/2 found | – |  |
| hono-7a254bc0 | bigger | A | 1 | yes | 580 | 1,887,160 | +32/−1 | 1.00 |  |
| es-toolkit-8f557cb3 | bigger | B | 1 | yes | 109 | 428,127 | +6/−6 | 1.00 |  |
| review-es-toolkit-meanBy | review | A | 1 | no | 658 | 849,035 | 1/2 found | – |  |
| review-hono-jsx-gap | review | A | 1 | yes | 195 | 561,464 | 1/1 found | – |  |
| hono-b20d4225 | bigger | L | 1 | yes | 214 | 1,000,033 | +4/−4 | 0.31 |  |
| review-es-toolkit-orderBy | review | A | 1 | no | 678 | 1,109,754 | 0/2 found | – |  |
| es-toolkit-8f557cb3 | followup | A | 1 | yes | 895 | 1,137,618 | +6/−6 | 1.00 |  |
| review-es-toolkit-meanBy | review | L | 1 | no | 317 | 347,011 | 1/2 found | – |  |
| es-toolkit-ea692b9f | bigger | A | 1 | yes | 315 | 1,237,379 | +17/−21 | 0.73 |  |
| es-toolkit-ea692b9f | followup | A | 1 | yes | 666 | 3,429,680 | +12/−20 | 0.62 |  |
| review-hono-combine | review | A | 1 | no | 557 | 1,354,702 | 1/2 found | – |  |
| es-toolkit-8f557cb3 | bigger | A | 1 | yes | 116 | 519,585 | +6/−6 | 1.00 |  |
| es-toolkit-ea692b9f | bigger | B | 1 | yes | 294 | 1,455,138 | +17/−21 | 0.73 |  |
| es-toolkit-ea692b9f | followup | B | 1 | yes | 1171 | 6,557,966 | +20/−21 | 0.79 |  |
| hono-b20d4225 | bigger | A | 1 | yes | 317 | 1,418,905 | +17/−9 | 1.00 |  |
| hono-7a254bc0 | bigger | B | 1 | yes | 363 | 1,558,472 | +32/−1 | 1.00 |  |
| es-toolkit-8f557cb3 | followup | B | 1 | yes | 187 | 971,977 | +6/−6 | 1.00 |  |
