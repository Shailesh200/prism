# Real-agent proof

Generated 2026-10-16T10:02:41.288Z. Host claude, model claude-opus-5-5. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### followup (9 A / 9 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 9/9 | 8/9 |
| Blind grade, correctness (1–5) | 4.56 | 4.44 |
| Blind grade, minimal code (1–5) | 4.44 | 3.89 |
| Blind grade, house style (1–5) | 4.44 | 4.00 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 1–3 of 9 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 1.00 |
| Sessions that added a new source file | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 0/9 | 1/9 |
| Sessions breaking a nearby test that passes upstream | 0/9 | 0/9 |
| Sessions that read outside the checkout or its history | 1 | 2 |

| Turn | A pass | B pass | A tokens, median | B tokens, median | B Prism text, median chars |
|---|---|---|---|---|---|
| 1 | 5/9 | 5/9 | 260,570 | 260,368 | 1086 |
| 2 | 8/9 | 7/8 | 142,042 | 160,955 | 427 |
| 3 | 5/5 | 4/4 | 153,429 | 135,432 | 175 |

### Review set: planted problems found

Each task is a correct maintainer fix with 1–2 problems planted (a bug, a copied helper, unused new API, a style break, a design or speed problem). Found = a finding on the planted lines (±3). Precision counts a finding as right when it is on a planted problem or the blind grader calls it a real problem.

| Arm | Sessions | Planted problems found | All found | Findings per review | Precision, planted only | Precision, with grader | Edited files |
|---|---|---|---|---|---|---|---|
| No help | 3 | 4/6 (67%) | 1/3 | 1.7 | 100% | 100% | 0 |
| Prism, lens automatic | 3 | 5/6 (83%) | 2/3 | 2.7 | 100% | 100% | 0 |

| Found, by kind | No help | Prism, lens automatic |
|---|---|---|
| bug | 1/3 | 2/3 |
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
| followup | A: 535,131 tok, $0.435, 114 s; B: 548,190 tok, $0.380, 103 s |
| review | A: 104,183 tok, $0.141, 22 s; B: 126,441 tok, $0.178, 28 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| es-toolkit-15043d8e | followup | A | 1 | yes | 44 | 278,103 | +2/−1 | 1.00 |  |
| hono-b20d4225 | followup | B | 1 | yes | 97 | 596,033 | +6/−5 | 0.42 |  |
| es-toolkit-8f557cb3 | followup | A | 1 | yes | 132 | 622,146 | +6/−6 | 1.00 |  |
| es-toolkit-ea692b9f | followup | A | 1 | yes | 114 | 587,352 | +17/−21 | 0.73 |  |
| es-toolkit-2c4c0478 | followup | A | 1 | yes | 96 | 375,918 | +6/−4 | 1.67 |  |
| hono-b20d4225 | followup | A | 1 | yes | 64 | 364,431 | +4/−4 | 0.31 |  |
| es-toolkit-e62aa15f | followup | B | 1 | yes | 590 | 1,760,028 | +6/−3 | 3.00 |  |
| hono-7a254bc0 | followup | A | 1 | yes | 99 | 535,131 | +32/−1 | 1.00 |  |
| es-toolkit-2c4c0478 | followup | B | 1 | yes | 98 | 413,695 | +6/−4 | 1.67 |  |
| es-toolkit-3433044c | followup | B | 1 | no | 601 | 2,666,905 | +5/−4 | 0.25 | timed out |
| hono-3d8abbc2 | followup | B | 1 | yes | 103 | 312,567 | +34/−11 | 0.83 |  |
| es-toolkit-15043d8e | followup | B | 1 | yes | 90 | 422,736 | +2/−1 | 1.00 |  |
| es-toolkit-8f557cb3 | followup | B | 1 | yes | 152 | 496,079 | +6/−6 | 1.00 |  |
| es-toolkit-ea692b9f | followup | B | 1 | yes | 293 | 984,044 | +17/−21 | 0.73 | left the sandbox |
| hono-7a254bc0 | followup | B | 1 | yes | 87 | 548,190 | +32/−1 | 1.00 | left the sandbox |
| hono-3d8abbc2 | followup | A | 1 | yes | 114 | 402,612 | +43/−19 | 1.15 |  |
| es-toolkit-3433044c | followup | A | 1 | yes | 700 | 2,371,556 | +2/−2 | 0.11 | left the sandbox |
| es-toolkit-e62aa15f | followup | A | 1 | yes | 217 | 922,548 | +9/−2 | 3.67 |  |
| review-es-toolkit-meanBy | review | A | 1 | yes | 22 | 104,183 | 2/2 found | – |  |
| review-hono-combine | review | A | 1 | no | 19 | 115,968 | 1/2 found | – |  |
| review-hono-etag | review | A | 1 | no | 26 | 89,372 | 1/2 found | – |  |
| review-es-toolkit-meanBy | review | B | 1 | yes | 31 | 165,606 | 2/2 found | – |  |
| review-hono-etag | review | B | 1 | yes | 25 | 117,904 | 2/2 found | – |  |
| review-hono-combine | review | B | 1 | no | 28 | 126,441 | 1/2 found | – |  |
