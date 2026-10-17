# Real-agent proof

Generated 2026-10-15T15:31:08.252Z. Host claude, model claude-opus-5-5. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### small (22 A / 22 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 22/22 | 20/22 |
| Blind grade, correctness (1–5) | 0.00 | 0.00 |
| Blind grade, minimal code (1–5) | 0.00 | 0.00 |
| Blind grade, house style (1–5) | 0.00 | 0.00 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 0–0 of 0 |
| Change size vs the maintainers' fix, median (1.00 = same) | – | – |
| Sessions that added a new source file | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 0/0 | 0/0 |
| Sessions breaking a nearby test that passes upstream | 0/0 | 0/0 |
| Sessions that read outside the checkout or its history | 0 | 0 |

## Cost

Small set (the earlier es-toolkit + hono tasks), B − A with a 95% bootstrap interval:

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 22 | 22 | |
| Success | 100% | 91% | -9.1 pp (-22.7 to 0.0) |
| Tokens, mean | 139,665 | 163,552 | 23,888 (-31,146 to 88,713) |
| Seconds, mean | 91 | 97 | 6 (-52 to 61) |
| USD, mean | 0.15 | 0.17 | 0.02 (-0.02 to 0.06) |
| Tokens, median | 109,526 | 121,823 | |
| Sessions calling a Prism tool | | 0/22 | |

Medians per set and arm:

| Set | Per arm |
|---|---|
| small | A: 109,526 tok, $0.143, 51 s; B: 121,823 tok, $0.151, 60 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| es-toolkit-e62aa15f | small | A | 2 | yes | 87 | 213,287 |  | – |  |
| hono-e5bb2062 | small | A | 1 | yes (re-scored: yes) | 21 | 87,516 |  | – |  |
| hono-afb2068c | small | A | 2 | yes | 31 | 88,161 |  | – |  |
| es-toolkit-d9574efd | small | A | 2 | yes | 42 | 71,836 |  | – |  |
| es-toolkit-323893f2 | small | A | 1 | yes | 75 | 125,084 |  | – |  |
| es-toolkit-827b92f7 | small | B | 2 | yes | 55 | 170,666 |  | – |  |
| es-toolkit-3433044c | small | B | 2 | yes | 184 | 213,062 |  | – |  |
| hono-e5bb2062 | small | B | 2 | no (re-scored: yes) | 74 | 132,046 |  | – |  |
| es-toolkit-827b92f7 | small | A | 1 | yes | 52 | 111,924 |  | – |  |
| es-toolkit-15043d8e | small | B | 1 | yes | 29 | 89,905 |  | – |  |
| hono-afb2068c | small | B | 1 | yes | 45 | 104,060 |  | – |  |
| es-toolkit-2c4c0478 | small | A | 2 | yes | 56 | 143,077 |  | – |  |
| es-toolkit-827b92f7 | small | A | 2 | yes | 61 | 142,256 |  | – |  |
| es-toolkit-d9574efd | small | B | 1 | yes | 179 | 202,469 |  | – |  |
| es-toolkit-99af1860 | small | B | 1 | yes | 27 | 86,360 |  | – |  |
| hono-e5bb2062 | small | B | 1 | no (re-scored: yes) | 53 | 108,018 |  | – |  |
| es-toolkit-e62aa15f | small | A | 1 | yes | 91 | 176,506 |  | – |  |
| hono-c3053ccf | small | A | 1 | yes | 26 | 96,729 |  | – |  |
| es-toolkit-d9574efd | small | B | 2 | yes | 48 | 111,600 |  | – |  |
| es-toolkit-99af1860 | small | A | 2 | yes | 49 | 60,882 |  | – |  |
| hono-afb2068c | small | A | 1 | yes | 43 | 99,609 |  | – |  |
| es-toolkit-827b92f7 | small | B | 1 | yes | 69 | 90,707 |  | – |  |
| es-toolkit-e62aa15f | small | B | 1 | yes | 130 | 204,049 |  | – |  |
| es-toolkit-323893f2 | small | A | 2 | yes | 89 | 89,345 |  | – |  |
| hono-c3053ccf | small | B | 1 | yes | 42 | 151,752 |  | – |  |
| es-toolkit-d9574efd | small | A | 1 | yes | 40 | 103,979 |  | – |  |
| es-toolkit-3433044c | small | B | 1 | yes | 337 | 659,179 |  | – |  |
| es-toolkit-3433044c | small | A | 1 | yes | 513 | 321,701 |  | – |  |
| es-toolkit-15043d8e | small | A | 2 | yes | 50 | 107,128 |  | – |  |
| es-toolkit-15043d8e | small | B | 2 | yes | 43 | 89,248 |  | – |  |
| es-toolkit-323893f2 | small | B | 1 | yes | 178 | 141,825 |  | – |  |
| es-toolkit-99af1860 | small | B | 2 | yes | 53 | 62,701 |  | – |  |
| es-toolkit-15043d8e | small | A | 1 | yes | 182 | 233,013 |  | – |  |
| es-toolkit-99af1860 | small | A | 1 | yes | 25 | 61,215 |  | – |  |
| hono-c3053ccf | small | A | 2 | yes | 34 | 118,357 |  | – |  |
| es-toolkit-2c4c0478 | small | B | 1 | yes | 102 | 132,515 |  | – |  |
| es-toolkit-2c4c0478 | small | B | 2 | yes | 286 | 304,180 |  | – |  |
| es-toolkit-3433044c | small | A | 2 | yes | 216 | 303,096 |  | – |  |
| hono-afb2068c | small | B | 2 | yes | 21 | 81,165 |  | – |  |
| es-toolkit-e62aa15f | small | B | 2 | yes | 66 | 248,373 |  | – |  |
| hono-c3053ccf | small | B | 2 | yes | 26 | 102,682 |  | – |  |
| hono-e5bb2062 | small | A | 2 | yes (re-scored: yes) | 44 | 96,188 |  | – |  |
| es-toolkit-323893f2 | small | B | 2 | yes | 97 | 111,591 |  | – |  |
| es-toolkit-2c4c0478 | small | A | 1 | yes | 174 | 221,733 |  | – |  |
