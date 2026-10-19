# Real-agent proof

Generated 2026-10-16T07:20:17.396Z. Host claude, model claude-opus-5-5. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### Review set: planted problems found

Each task is a correct maintainer fix with 1–2 problems planted (a bug, a copied helper, unused new API, a style break, a design or speed problem). Found = a finding on the planted lines (±3). Precision counts a finding as right when it is on a planted problem or the blind grader calls it a real problem.

| Arm | Sessions | Planted problems found | All found | Findings per review | Precision, planted only | Precision, with grader | Edited files |
|---|---|---|---|---|---|---|---|
| No help | 6 | 10/11 (91%) | 5/6 | 2.5 | 87% | 100% | 0 |
| Prism, lens automatic | 6 | 10/11 (91%) | 5/6 | 2.3 | 79% | 100% | 0 |
| Prism, lens named | 6 | 9/11 (82%) | 4/6 | 2.5 | 60% | 100% | 0 |
| ponytail review | 6 | 10/11 (91%) | 5/6 | 2.7 | 75% | 94% | 0 |

| Found, by kind | No help | Prism, lens automatic | Prism, lens named | ponytail review |
|---|---|---|---|---|
| bug | 5/6 | 5/6 | 4/6 | 5/6 |
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
| review | A: 136,006 tok, $0.179, 29 s; B: 129,654 tok, $0.178, 29 s; L: 158,874 tok, $0.212, 39 s; P: 168,469 tok, $0.218, 34 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| review-hono-jsx-gap | review | B | 1 | yes | 19 | 67,207 | 1/1 found | – |  |
| review-es-toolkit-meanBy | review | A | 1 | yes | 27 | 134,122 | 2/2 found | – |  |
| review-hono-combine | review | A | 1 | no | 24 | 119,340 | 1/2 found | – |  |
| review-es-toolkit-meanBy | review | L | 1 | yes | 43 | 214,803 | 2/2 found | – |  |
| review-es-toolkit-intersectionBy | review | B | 1 | yes | 29 | 160,112 | 2/2 found | – |  |
| review-hono-etag | review | A | 1 | yes | 32 | 137,890 | 2/2 found | – |  |
| review-hono-combine | review | P | 1 | no | 27 | 111,386 | 1/2 found | – |  |
| review-hono-etag | review | L | 1 | no | 24 | 118,676 | 1/2 found | – |  |
| review-hono-etag | review | P | 1 | yes | 49 | 193,250 | 2/2 found | – |  |
| review-es-toolkit-meanBy | review | B | 1 | yes | 29 | 140,206 | 2/2 found | – |  |
| review-es-toolkit-orderBy | review | A | 1 | yes | 44 | 160,299 | 2/2 found | – |  |
| review-es-toolkit-intersectionBy | review | P | 1 | yes | 40 | 181,952 | 2/2 found | – |  |
| review-hono-combine | review | L | 1 | no | 34 | 152,597 | 1/2 found | – |  |
| review-hono-jsx-gap | review | L | 1 | yes | 18 | 68,224 | 1/1 found | – |  |
| review-es-toolkit-orderBy | review | B | 1 | yes | 50 | 166,027 | 2/2 found | – |  |
| review-es-toolkit-orderBy | review | P | 1 | yes | 46 | 220,674 | 2/2 found | – |  |
| review-es-toolkit-intersectionBy | review | L | 1 | yes | 67 | 296,350 | 2/2 found | – |  |
| review-hono-etag | review | B | 1 | yes | 30 | 119,102 | 2/2 found | – |  |
| review-hono-combine | review | B | 1 | no | 24 | 95,850 | 1/2 found | – |  |
| review-hono-jsx-gap | review | P | 1 | yes | 18 | 79,332 | 1/1 found | – |  |
| review-hono-jsx-gap | review | A | 1 | yes | 16 | 65,123 | 1/1 found | – |  |
| review-es-toolkit-meanBy | review | P | 1 | yes | 29 | 154,986 | 2/2 found | – |  |
| review-es-toolkit-orderBy | review | L | 1 | yes | 43 | 165,151 | 2/2 found | – |  |
| review-es-toolkit-intersectionBy | review | A | 1 | yes | 47 | 216,995 | 2/2 found | – |  |
