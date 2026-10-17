# Real-agent proof

Generated 2026-10-16T11:25:27.602Z. Host opencode, model opencode/mimo-v2.6-flash-free. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### small (11 A / 11 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 8/11 | 8/11 |
| Blind grade, correctness (1–5) | 4.64 | 4.27 |
| Blind grade, minimal code (1–5) | 4.36 | 4.36 |
| Blind grade, house style (1–5) | 4.36 | 4.09 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 2–4 of 11 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 1.00 |
| Sessions that added a new source file | 1 | 1 |
| Sessions breaking the repo's lint/format where upstream passes | 0/11 | 1/11 |
| Sessions breaking a nearby test that passes upstream | 0/10 | 0/8 |
| Sessions that read outside the checkout or its history | 0 | 0 |

## Cost

Small set (the earlier es-toolkit + hono tasks), B − A with a 95% bootstrap interval:

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 11 | 11 | |
| Success | 73% | 73% | 0.0 pp (-36.4 to 36.4) |
| Tokens, mean | 627,945 | 473,963 | -153,982 (-384,180 to 58,515) |
| Seconds, mean | 442 | 396 | -46 (-185 to 90) |
| USD, mean | 0.00 | 0.00 | 0.00 (0.00 to 0.00) |
| Tokens, median | 574,282 | 414,169 | |
| Sessions calling a Prism tool | | 11/11 | |

Medians per set and arm:

| Set | Per arm |
|---|---|
| small | A: 574,282 tok, $0.000, 512 s; B: 414,169 tok, $0.000, 401 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| es-toolkit-2c4c0478 | small | B | 1 | no | 600 | 309,093 | +6/−5 | 1.83 | timed out |
| es-toolkit-827b92f7 | small | A | 1 | no | 600 | 619,099 | +4/−12 | 0.57 | timed out |
| es-toolkit-15043d8e | small | A | 1 | no | 600 | 912,158 | +2/−1 | 1.00 | timed out |
| hono-afb2068c | small | B | 1 | yes | 370 | 547,374 | +4/−0 | 1.00 |  |
| es-toolkit-e62aa15f | small | B | 1 | yes | 401 | 680,145 | +3/−0 | 1.00 |  |
| es-toolkit-99af1860 | small | A | 1 | yes | 518 | 497,996 | +1/−1 | 1.00 |  |
| es-toolkit-d9574efd | small | A | 1 | yes | 450 | 574,282 | +7/−2 | 0.75 |  |
| es-toolkit-3433044c | small | A | 1 | no | 600 | 1,391,775 | +29/−7 | 1.00 | timed out |
| es-toolkit-827b92f7 | small | B | 1 | no | 600 | 414,169 | +0/−0 | 0.00 | timed out |
| es-toolkit-3433044c | small | B | 1 | yes | 534 | 1,030,587 | +22/−3 | 0.69 |  |
| hono-afb2068c | small | A | 1 | yes | 425 | 823,491 | +4/−0 | 1.00 |  |
| hono-c3053ccf | small | A | 1 | yes | 109 | 188,964 | +4/−2 | 1.00 |  |
| es-toolkit-323893f2 | small | A | 1 | yes | 542 | 575,588 | +19/−6 | 1.92 |  |
| hono-e5bb2062 | small | B | 1 | yes | 171 | 413,492 | +1/−1 | 1.00 |  |
| hono-c3053ccf | small | B | 1 | yes | 99 | 347,203 | +3/−1 | 0.67 |  |
| es-toolkit-d9574efd | small | B | 1 | yes | 425 | 540,546 | +4/−2 | 0.50 |  |
| es-toolkit-15043d8e | small | B | 1 | yes | 283 | 441,757 | +2/−1 | 1.00 |  |
| es-toolkit-e62aa15f | small | A | 1 | yes | 264 | 330,705 | +8/−3 | 3.67 |  |
| es-toolkit-99af1860 | small | B | 1 | yes | 269 | 240,143 | +1/−1 | 1.00 |  |
| hono-e5bb2062 | small | A | 1 | yes | 241 | 486,401 | +1/−1 | 1.00 |  |
| es-toolkit-323893f2 | small | B | 1 | no | 600 | 249,087 | +0/−0 | 0.00 | timed out |
| es-toolkit-2c4c0478 | small | A | 1 | yes | 512 | 506,939 | +7/−5 | 2.00 |  |
