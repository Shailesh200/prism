# Real-agent proof

Generated 2026-10-16T07:20:17.580Z. Host agent, model grok-4.7-high. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### Review set: planted problems found

Each task is a correct maintainer fix with 1–2 problems planted (a bug, a copied helper, unused new API, a style break, a design or speed problem). Found = a finding on the planted lines (±3). Precision counts a finding as right when it is on a planted problem or the blind grader calls it a real problem.

| Arm | Sessions | Planted problems found | All found | Findings per review | Precision, planted only | Precision, with grader | Edited files |
|---|---|---|---|---|---|---|---|
| Prism, lens automatic | 4 | 4/7 (57%) | 1/4 | 1.3 | 80% | 100% | 0 |
| Prism, lens named | 4 | 3/7 (43%) | 1/4 | 1.0 | 75% | 100% | 0 |

| Found, by kind | Prism, lens automatic | Prism, lens named |
|---|---|---|
| bug | 1/4 | 2/4 |
| reuse | 1/1 | 1/1 |
| style | 1/1 | 0/1 |
| minimal | 0/0 | 0/0 |
| design | 1/1 | 0/1 |
| perf | 0/0 | 0/0 |

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
| review | B: 670,605 tok, $0.000, 469 s; L: 505,833 tok, $0.000, 382 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| review-hono-jsx-gap | review | B | 1 | yes | 169 | 178,956 | 1/1 found | – |  |
| review-es-toolkit-meanBy | review | B | 1 | no | 465 | 503,532 | 1/2 found | – |  |
| review-hono-combine | review | L | 1 | no | 502 | 1,432,523 | 1/2 found | – |  |
| review-hono-jsx-gap | review | L | 1 | yes | 152 | 300,700 | 1/1 found | – |  |
| review-hono-combine | review | B | 1 | no | 472 | 1,181,036 | 1/2 found | – |  |
| review-es-toolkit-orderBy | review | L | 1 | no | 320 | 630,286 | 0/2 found | – |  |
| review-es-toolkit-meanBy | review | L | 1 | no | 444 | 381,380 | 1/2 found | – |  |
| review-es-toolkit-orderBy | review | B | 1 | no | 478 | 837,678 | 1/2 found | – |  |
