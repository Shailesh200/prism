# Real-agent proof

Generated 2026-10-15T22:24:49.583Z. Host claude, model claude-opus-5-5. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### small (11 A / 11 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 11/11 | 11/11 |
| Blind grade, correctness (1–5) | 4.27 | 4.55 |
| Blind grade, minimal code (1–5) | 4.36 | 4.27 |
| Blind grade, house style (1–5) | 4.18 | 4.09 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 3–3 of 11 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 1.00 |
| Sessions that added a new source file | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 0/11 | 0/11 |
| Sessions breaking a nearby test that passes upstream | 0/10 | 0/10 |
| Sessions that read outside the checkout or its history | 0 | 0 |

### bigger (6 A / 6 B / 6 L / 6 P sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) | Arm L (Prism, Architect lens named) | Arm P (ponytail plugin) |
|---|---|---|---|---|
| Correct: the failing tests pass, tests untouched | 6/6 | 6/6 | 6/6 | 6/6 |
| Blind grade, correctness (1–5) | 4.50 | 4.33 | 4.17 | 4.17 |
| Blind grade, minimal code (1–5) | 4.17 | 4.33 | 4.00 | 4.33 |
| Blind grade, house style (1–5) | 4.17 | 4.17 | 4.00 | 4.17 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 1–1 of 6 | 1–1 of 6 | 0–2 of 6 |
| Change size vs the maintainers' fix, median (1.00 = same) | 0.91 | 0.87 | 0.87 | 0.82 |
| Sessions that added a new source file | 1 | 0 | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 0/6 | 0/6 | 0/6 | 0/6 |
| Sessions breaking a nearby test that passes upstream | 0/5 | 0/5 | 0/6 | 0/5 |
| Sessions that read outside the checkout or its history | 0 | 0 | 0 | 0 |

### followup (9 A / 9 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 8/9 | 8/9 |
| Blind grade, correctness (1–5) | 4.67 | 3.78 |
| Blind grade, minimal code (1–5) | 4.44 | 4.11 |
| Blind grade, house style (1–5) | 4.22 | 4.11 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 1–4 of 9 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 1.00 |
| Sessions that added a new source file | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 0/9 | 0/9 |
| Sessions breaking a nearby test that passes upstream | 0/9 | 0/8 |
| Sessions that read outside the checkout or its history | 0 | 3 |

| Turn | A pass | B pass | A tokens, median | B tokens, median | B Prism text, median chars |
|---|---|---|---|---|---|
| 1 | 5/9 | 5/9 | 132,663 | 164,953 | 1086 |
| 2 | 7/8 | 7/9 | 130,809 | 143,257 | 466 |
| 3 | 4/4 | 4/5 | 106,541 | 150,657 | 354 |

### Review set: planted problems found

Each task is a correct maintainer fix with 1–2 problems planted (a bug, a copied helper, unused new API, a style break, a design or speed problem). Found = a finding on the planted lines (±3). Precision counts a finding as right when it is on a planted problem or the blind grader calls it a real problem.

| Arm | Sessions | Planted problems found | All found | Findings per review | Precision, planted only | Precision, with grader | Edited files |
|---|---|---|---|---|---|---|---|
| No help | 6 | 9/11 (82%) | 4/6 | 2.0 | 92% | 100% | 1 |
| Prism, lens automatic | 6 | 11/11 (100%) | 6/6 | 2.5 | 87% | 100% | 1 |
| Prism, lens named | 6 | 9/11 (82%) | 4/6 | 2.8 | 65% | 82% | 0 |
| ponytail review | 6 | 10/11 (91%) | 5/6 | 2.2 | 85% | 100% | 0 |

| Found, by kind | No help | Prism, lens automatic | Prism, lens named | ponytail review |
|---|---|---|---|---|
| bug | 4/6 | 6/6 | 4/6 | 5/6 |
| reuse | 1/1 | 1/1 | 1/1 | 1/1 |
| style | 1/1 | 1/1 | 1/1 | 1/1 |
| minimal | 1/1 | 1/1 | 1/1 | 1/1 |
| design | 1/1 | 1/1 | 1/1 | 1/1 |
| perf | 1/1 | 1/1 | 1/1 | 1/1 |

## Cost

Small set (the earlier es-toolkit + hono tasks), B − A with a 95% bootstrap interval:

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 11 | 11 | |
| Success | 100% | 100% | 0.0 pp (0.0 to 0.0) |
| Tokens, mean | 159,980 | 152,342 | -7,638 (-66,812 to 46,653) |
| Seconds, mean | 61 | 52 | -9 (-48 to 26) |
| USD, mean | 0.18 | 0.19 | 0.01 (-0.03 to 0.05) |
| Tokens, median | 144,373 | 134,414 | |
| Sessions calling a Prism tool | | 0/11 | |

Medians per set and arm:

| Set | Per arm |
|---|---|
| small | A: 144,373 tok, $0.168, 42 s; B: 134,414 tok, $0.185, 42 s |
| bigger | A: 172,985 tok, $0.201, 53 s; B: 153,371 tok, $0.205, 53 s; L: 206,430 tok, $0.223, 56 s; P: 150,624 tok, $0.198, 44 s |
| followup | A: 399,286 tok, $0.000, 114 s; B: 359,169 tok, $0.000, 117 s |
| review | A: 90,881 tok, $0.146, 22 s; B: 119,753 tok, $0.180, 32 s; L: 102,817 tok, $0.175, 48 s; P: 133,694 tok, $0.212, 35 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| hono-7a254bc0 | bigger | A | 1 | yes | 52 | 218,553 | +32/−1 | 1.00 |  |
| es-toolkit-d9574efd | small | B | 1 | yes | 40 | 125,369 | +18/−3 | 1.75 |  |
| hono-7a254bc0 | followup | A | 1 | yes | 162 | 571,041 | +32/−1 | 1.00 |  |
| review-es-toolkit-meanBy | review | L | 1 | yes | 44 | 108,384 | 2/2 found | – |  |
| hono-3d8abbc2 | bigger | A | 1 | yes | 53 | 195,797 | +39/−24 | 1.17 |  |
| review-es-toolkit-intersectionBy | review | A | 1 | yes | 31 | 100,170 | 2/2 found | – |  |
| es-toolkit-3433044c | small | A | 1 | yes | 66 | 153,869 | +3/−2 | 0.14 |  |
| es-toolkit-99af1860 | small | A | 1 | yes | 25 | 97,375 | +1/−1 | 1.00 |  |
| hono-3d8abbc2 | bigger | B | 1 | yes | 60 | 151,368 | +37/−24 | 1.13 |  |
| hono-c3053ccf | small | B | 1 | yes | 23 | 119,922 | +5/−4 | 1.50 |  |
| review-hono-etag | review | A | 1 | no | 17 | 89,617 | 1/2 found | – |  |
| es-toolkit-8f557cb3 | bigger | B | 1 | yes | 33 | 135,259 | +6/−6 | 1.00 |  |
| review-es-toolkit-orderBy | review | P | 1 | yes | 58 | 119,106 | 2/2 found | – |  |
| review-es-toolkit-meanBy | review | A | 1 | yes | 19 | 75,643 | 2/2 found | – |  |
| es-toolkit-2c4c0478 | small | B | 1 | yes | 71 | 189,177 | +4/−2 | 1.00 |  |
| es-toolkit-e62aa15f | small | B | 1 | yes | 133 | 324,934 | +9/−2 | 3.67 |  |
| es-toolkit-ea692b9f | bigger | B | 1 | yes | 78 | 197,742 | +17/−21 | 0.73 |  |
| es-toolkit-ea692b9f | bigger | A | 1 | yes | 123 | 393,915 | +17/−21 | 0.73 |  |
| hono-7a254bc0 | followup | B | 1 | yes | 160 | 789,953 | +33/−1 | 1.03 |  |
| hono-b20d4225 | bigger | B | 1 | yes | 31 | 126,989 | +6/−5 | 0.42 |  |
| hono-3d8abbc2 | bigger | L | 1 | yes | 54 | 202,463 | +40/−23 | 1.17 |  |
| es-toolkit-ea692b9f | followup | B | 1 | yes | 216 | 566,281 | +17/−21 | 0.73 | left the sandbox |
| hono-e5bb2062 | small | A | 1 | yes | 31 | 117,770 | +1/−1 | 1.00 |  |
| es-toolkit-2c4c0478 | small | A | 1 | yes | 37 | 144,373 | +6/−4 | 1.67 |  |
| review-es-toolkit-intersectionBy | review | P | 1 | yes | 27 | 148,282 | 2/2 found | – |  |
| es-toolkit-15043d8e | followup | A | 1 | yes | 43 | 185,506 | +2/−1 | 1.00 |  |
| es-toolkit-ea692b9f | followup | A | 1 | yes | 130 | 435,031 | +17/−21 | 0.73 |  |
| hono-22db73f4 | bigger | L | 1 | yes | 68 | 210,396 | +28/−8 | 0.60 |  |
| review-hono-combine | review | B | 1 | yes | 50 | 175,629 | 2/2 found | – |  |
| hono-b20d4225 | bigger | L | 1 | yes | 44 | 183,143 | +5/−4 | 0.35 |  |
| review-hono-jsx-gap | review | A | 1 | yes | 23 | 66,295 | 1/1 found | – |  |
| hono-3d8abbc2 | bigger | P | 1 | yes | 75 | 214,084 | +37/−25 | 1.15 |  |
| es-toolkit-8f557cb3 | bigger | P | 1 | yes | 31 | 112,898 | +6/−6 | 1.00 |  |
| review-hono-jsx-gap | review | P | 1 | yes | 17 | 79,321 | 1/1 found | – |  |
| hono-b20d4225 | followup | B | 1 | yes | 73 | 359,169 | +4/−4 | 0.31 |  |
| hono-b20d4225 | bigger | A | 1 | yes | 29 | 117,382 | +4/−4 | 0.31 |  |
| es-toolkit-15043d8e | small | B | 1 | yes | 27 | 135,361 | +2/−1 | 1.00 |  |
| es-toolkit-8f557cb3 | followup | B | 1 | yes | 111 | 263,549 | +6/−6 | 1.00 |  |
| es-toolkit-d9574efd | small | A | 1 | yes | 51 | 123,016 | +18/−2 | 1.67 |  |
| es-toolkit-3433044c | followup | A | 1 | no | 601 | 2,616,759 | +2/−2 | 0.11 | timed out; tokens from transcript (timed out) |
| review-hono-combine | review | A | 1 | no | 21 | 92,144 | 1/2 found | – |  |
| hono-3d8abbc2 | followup | A | 1 | yes | 114 | 399,286 | +35/−17 | 0.96 |  |
| es-toolkit-323893f2 | small | B | 1 | yes | 55 | 139,734 | +13/−7 | 1.54 |  |
| es-toolkit-3433044c | small | B | 1 | yes | 91 | 134,414 | +2/−2 | 0.11 |  |
| review-hono-combine | review | L | 1 | no | 35 | 97,250 | 1/2 found | – |  |
| hono-e5bb2062 | small | B | 1 | yes | 43 | 115,496 | +1/−1 | 1.00 |  |
| review-es-toolkit-orderBy | review | L | 1 | yes | 52 | 133,788 | 2/2 found | – |  |
| es-toolkit-827b92f7 | small | A | 1 | yes | 43 | 160,424 | +4/−9 | 0.46 |  |
| review-es-toolkit-orderBy | review | B | 1 | yes | 36 | 132,498 | 2/2 found | – |  |
| es-toolkit-827b92f7 | small | B | 1 | yes | 42 | 171,087 | +4/−9 | 0.46 |  |
| review-hono-etag | review | P | 1 | yes | 51 | 196,789 | 2/2 found | – |  |
| review-es-toolkit-intersectionBy | review | B | 1 | no | 44 | 134,372 | 2/2 found | – | edited files |
| es-toolkit-323893f2 | small | A | 1 | yes | 96 | 134,138 | +13/−7 | 1.54 |  |
| es-toolkit-e62aa15f | followup | A | 1 | yes | 192 | 748,945 | +9/−2 | 3.67 |  |
| hono-3d8abbc2 | followup | B | 1 | yes | 75 | 334,229 | +29/−12 | 0.76 |  |
| hono-7a254bc0 | bigger | B | 1 | yes | 64 | 296,410 | +32/−1 | 1.00 |  |
| review-hono-etag | review | L | 1 | yes | 23 | 94,298 | 2/2 found | – |  |
| es-toolkit-15043d8e | followup | B | 1 | yes | 63 | 219,362 | +2/−1 | 1.00 |  |
| review-es-toolkit-orderBy | review | A | 1 | no | 112 | 257,604 | 2/2 found | – | edited files |
| es-toolkit-3433044c | followup | B | 1 | no | 658 | 2,384,113 | +0/−0 | 0.00 | left the sandbox |
| review-hono-etag | review | B | 1 | yes | 28 | 94,330 | 2/2 found | – |  |
| hono-7a254bc0 | bigger | L | 1 | yes | 57 | 224,650 | +32/−1 | 1.00 |  |
| hono-22db73f4 | bigger | B | 1 | yes | 46 | 155,373 | +41/−2 | 0.72 |  |
| hono-b20d4225 | bigger | P | 1 | yes | 29 | 130,552 | +4/−4 | 0.31 |  |
| review-es-toolkit-meanBy | review | P | 1 | yes | 30 | 89,231 | 2/2 found | – |  |
| es-toolkit-99af1860 | small | B | 1 | yes | 24 | 98,110 | +1/−1 | 1.00 |  |
| es-toolkit-2c4c0478 | followup | A | 1 | yes | 100 | 235,821 | +4/−2 | 1.00 |  |
| hono-afb2068c | small | B | 1 | yes | 28 | 122,161 | +5/−0 | 1.25 |  |
| hono-22db73f4 | bigger | P | 1 | yes | 42 | 131,307 | +9/−1 | 0.17 |  |
| hono-7a254bc0 | bigger | P | 1 | yes | 46 | 258,782 | +29/−1 | 0.91 |  |
| es-toolkit-8f557cb3 | followup | A | 1 | yes | 64 | 258,952 | +6/−6 | 1.00 |  |
| es-toolkit-e62aa15f | followup | B | 1 | yes | 232 | 774,083 | +3/−0 | 1.00 | left the sandbox |
| review-hono-jsx-gap | review | L | 1 | yes | 98 | 68,820 | 1/1 found | – |  |
| review-hono-jsx-gap | review | B | 1 | yes | 22 | 93,575 | 1/1 found | – |  |
| es-toolkit-e62aa15f | small | A | 1 | yes | 218 | 390,003 | +3/−0 | 1.00 |  |
| es-toolkit-8f557cb3 | bigger | A | 1 | yes | 41 | 103,143 | +6/−6 | 1.00 |  |
| review-es-toolkit-meanBy | review | B | 1 | yes | 26 | 107,008 | 2/2 found | – |  |
| hono-c3053ccf | small | A | 1 | yes | 37 | 166,452 | +3/−1 | 0.67 |  |
| hono-afb2068c | small | A | 1 | yes | 25 | 145,597 | +2/−0 | 0.50 |  |
| es-toolkit-8f557cb3 | bigger | L | 1 | yes | 43 | 138,641 | +6/−6 | 1.00 |  |
| hono-22db73f4 | bigger | A | 1 | yes | 87 | 150,173 | +47/−2 | 0.82 |  |
| es-toolkit-2c4c0478 | followup | B | 1 | yes | 117 | 244,324 | +4/−2 | 1.00 |  |
| review-es-toolkit-intersectionBy | review | L | 1 | no | 61 | 131,984 | 1/2 found | – |  |
| hono-b20d4225 | followup | A | 1 | yes | 81 | 369,264 | +12/−5 | 0.65 |  |
| es-toolkit-ea692b9f | bigger | P | 1 | yes | 56 | 169,940 | +17/−21 | 0.73 |  |
| review-hono-combine | review | P | 1 | no | 41 | 177,381 | 1/2 found | – |  |
| es-toolkit-15043d8e | small | A | 1 | yes | 42 | 126,765 | +2/−1 | 1.00 |  |
| es-toolkit-ea692b9f | bigger | L | 1 | yes | 245 | 336,979 | +17/−21 | 0.73 |  |
