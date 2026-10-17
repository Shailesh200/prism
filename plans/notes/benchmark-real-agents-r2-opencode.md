# Real-agent proof

Generated 2026-10-16T07:20:17.685Z. Host opencode, model opencode/mimo-v2.6-flash-free. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### small (11 A / 11 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 7/11 | 8/11 |
| Blind grade, correctness (1–5) | 3.82 | 3.64 |
| Blind grade, minimal code (1–5) | 4.00 | 3.36 |
| Blind grade, house style (1–5) | 3.82 | 3.09 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 2–6 of 11 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 0.67 |
| Sessions that added a new source file | 1 | 1 |
| Sessions breaking the repo's lint/format where upstream passes | 0/11 | 1/11 |
| Sessions breaking a nearby test that passes upstream | 0/7 | 0/7 |
| Sessions that read outside the checkout or its history | 0 | 0 |

## Cost

Small set (the earlier es-toolkit + hono tasks), B − A with a 95% bootstrap interval:

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 11 | 11 | |
| Success | 64% | 73% | 9.1 pp (-27.3 to 45.5) |
| Tokens, mean | 507,656 | 439,949 | -67,707 (-204,817 to 80,456) |
| Seconds, mean | 487 | 422 | -65 (-217 to 102) |
| USD, mean | 0.00 | 0.00 | 0.00 (0.00 to 0.00) |
| Tokens, median | 549,036 | 407,487 | |
| Sessions calling a Prism tool | | 10/11 | |

Medians per set and arm:

| Set | Per arm |
|---|---|
| small | A: 549,036 tok, $0.000, 591 s; B: 407,487 tok, $0.000, 363 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| es-toolkit-2c4c0478 | small | B | 1 | yes | 596 | 459,452 | +5/−3 | 1.33 |  |
| es-toolkit-827b92f7 | small | A | 1 | yes | 591 | 837,924 | +5/−19 | 0.86 |  |
| es-toolkit-15043d8e | small | A | 1 | no | 600 | 585,011 | +0/−0 | 0.00 | timed out |
| hono-afb2068c | small | B | 1 | yes | 363 | 517,801 | +2/−0 | 0.50 |  |
| es-toolkit-99af1860 | small | A | 1 | yes | 394 | 619,234 | +1/−1 | 1.00 |  |
| es-toolkit-d9574efd | small | A | 1 | no | 600 | 327,797 | +0/−0 | 0.00 | timed out |
| es-toolkit-3433044c | small | A | 1 | yes | 446 | 799,335 | +29/−7 | 1.00 |  |
| es-toolkit-827b92f7 | small | B | 1 | yes | 245 | 628,338 | +4/−9 | 0.46 |  |
| es-toolkit-3433044c | small | B | 1 | no | 878 | 291,076 | +0/−0 | 0.00 | timed out |
| hono-afb2068c | small | A | 1 | yes | 250 | 549,036 | +4/−0 | 1.00 |  |
| hono-c3053ccf | small | A | 1 | yes | 531 | 620,227 | +3/−1 | 0.67 |  |
| es-toolkit-323893f2 | small | A | 1 | no | 600 | 255,506 | +0/−0 | 0.00 | timed out |
| hono-e5bb2062 | small | B | 1 | yes | 217 | 308,172 | +1/−1 | 1.00 |  |
| hono-c3053ccf | small | B | 1 | yes | 133 | 319,685 | +3/−1 | 0.67 |  |
| es-toolkit-d9574efd | small | B | 1 | yes | 296 | 564,488 | +5/−2 | 0.58 |  |
| es-toolkit-e62aa15f | small | B | 1 | no | 600 | 701,745 | +12/−0 | 4.00 | timed out |
| es-toolkit-15043d8e | small | B | 1 | no | 600 | 407,487 | +0/−0 | 0.00 | timed out |
| es-toolkit-e62aa15f | small | A | 1 | no | 600 | 301,135 | +4/−2 | 2.00 | timed out |
| es-toolkit-99af1860 | small | B | 1 | yes | 208 | 246,745 | +1/−1 | 1.00 |  |
| hono-e5bb2062 | small | A | 1 | yes | 148 | 282,804 | +1/−1 | 1.00 |  |
| es-toolkit-323893f2 | small | B | 1 | yes | 503 | 394,452 | +19/−4 | 1.77 |  |
| es-toolkit-2c4c0478 | small | A | 1 | yes | 592 | 406,205 | +5/−3 | 1.33 |  |
