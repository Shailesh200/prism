# Real-agent proof

Generated 2026-10-15T23:27:28.593Z. Host claude, model claude-opus-5-5. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### Review set: planted problems found

Each task is a correct maintainer fix with 1–2 problems planted (a bug, a copied helper, unused new API, a style break, a design or speed problem). Found = a finding on the planted lines (±3). Precision counts a finding as right when it is on a planted problem or the blind grader calls it a real problem.

| Arm | Sessions | Planted problems found | All found | Findings per review | Precision, planted only | Precision, with grader | Edited files |
|---|---|---|---|---|---|---|---|
| No help | 6 | 10/11 (91%) | 5/6 | 2.3 | 79% | 100% | 0 |
| Prism, lens automatic | 6 | 10/11 (91%) | 5/6 | 2.3 | 79% | 100% | 0 |
| Prism, lens named | 6 | 10/11 (91%) | 5/6 | 2.7 | 81% | 94% | 0 |
| ponytail review | 6 | 10/11 (91%) | 5/6 | 1.8 | 91% | 100% | 0 |

| Found, by kind | No help | Prism, lens automatic | Prism, lens named | ponytail review |
|---|---|---|---|---|
| bug | 5/6 | 5/6 | 5/6 | 5/6 |
| reuse | 1/1 | 1/1 | 1/1 | 1/1 |
| style | 1/1 | 1/1 | 1/1 | 1/1 |
| minimal | 1/1 | 1/1 | 1/1 | 1/1 |
| design | 1/1 | 1/1 | 1/1 | 1/1 |
| perf | 1/1 | 1/1 | 1/1 | 1/1 |

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
| review | A: 111,142 tok, $0.169, 24 s; B: 99,934 tok, $0.161, 24 s; L: 114,689 tok, $0.169, 33 s; P: 155,073 tok, $0.209, 39 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| review-hono-jsx-gap | review | B | 1 | yes | 21 | 67,532 | 1/1 found | – |  |
| review-es-toolkit-meanBy | review | A | 1 | yes | 25 | 103,847 | 2/2 found | – |  |
| review-hono-combine | review | A | 1 | no | 24 | 118,437 | 1/2 found | – |  |
| review-es-toolkit-intersectionBy | review | A | 1 | yes | 36 | 163,498 | 2/2 found | – |  |
| review-es-toolkit-meanBy | review | L | 1 | yes | 32 | 110,265 | 2/2 found | – |  |
| review-es-toolkit-intersectionBy | review | B | 1 | yes | 60 | 170,700 | 2/2 found | – |  |
| review-hono-etag | review | A | 1 | yes | 17 | 65,964 | 2/2 found | – |  |
| review-hono-combine | review | P | 1 | no | 26 | 142,801 | 1/2 found | – |  |
| review-hono-etag | review | L | 1 | yes | 29 | 119,113 | 2/2 found | – |  |
| review-hono-etag | review | P | 1 | yes | 42 | 167,345 | 2/2 found | – |  |
| review-es-toolkit-meanBy | review | B | 1 | yes | 22 | 78,639 | 2/2 found | – |  |
| review-es-toolkit-orderBy | review | A | 1 | yes | 44 | 131,460 | 2/2 found | – |  |
| review-es-toolkit-intersectionBy | review | P | 1 | yes | 80 | 192,922 | 2/2 found | – |  |
| review-hono-combine | review | L | 1 | no | 41 | 122,345 | 1/2 found | – |  |
| review-hono-jsx-gap | review | L | 1 | yes | 25 | 68,054 | 1/1 found | – |  |
| review-es-toolkit-orderBy | review | B | 1 | yes | 56 | 158,224 | 2/2 found | – |  |
| review-es-toolkit-orderBy | review | P | 1 | yes | 69 | 220,959 | 2/2 found | – |  |
| review-es-toolkit-intersectionBy | review | L | 1 | yes | 55 | 197,935 | 2/2 found | – |  |
| review-hono-etag | review | B | 1 | yes | 16 | 68,716 | 2/2 found | – |  |
| review-hono-combine | review | B | 1 | no | 27 | 121,228 | 1/2 found | – |  |
| review-hono-jsx-gap | review | P | 1 | yes | 22 | 108,108 | 1/1 found | – |  |
| review-hono-jsx-gap | review | A | 1 | yes | 18 | 65,639 | 1/1 found | – |  |
| review-es-toolkit-meanBy | review | P | 1 | yes | 35 | 121,513 | 2/2 found | – |  |
| review-es-toolkit-orderBy | review | L | 1 | yes | 35 | 102,330 | 2/2 found | – |  |
