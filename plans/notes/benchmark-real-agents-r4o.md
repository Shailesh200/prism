# Real-agent proof

Generated 2026-10-17T08:52:28.006Z. Host claude, model claude-opus-5-5. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### small (22 A / 22 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 22/22 | 22/22 |
| Blind grade, correctness (1–5) | 4.77 | 4.73 |
| Blind grade, minimal code (1–5) | 4.36 | 4.59 |
| Blind grade, house style (1–5) | 4.23 | 4.36 |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 9–5 of 22 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 1.00 |
| Sessions that added a new source file | 2 | 1 |
| Sessions breaking the repo's lint/format where upstream passes | 0/22 | 1/22 |
| Sessions breaking a nearby test that passes upstream | 0/20 | 0/20 |
| Sessions that read outside the checkout or its history | 0 | 1 |

## Cost

Small set (the earlier es-toolkit + hono tasks), B − A with a 95% bootstrap interval:

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 22 | 22 | |
| Success | 100% | 100% | 0.0 pp (0.0 to 0.0) |
| Tokens, mean | 273,533 | 290,426 | 16,893 (-88,045 to 127,486) |
| Seconds, mean | 82 | 88 | 6 (-30 to 44) |
| USD, mean | 0.26 | 0.27 | 0.01 (-0.06 to 0.09) |
| Tokens, median | 229,880 | 252,821 | |
| Sessions calling a Prism tool | | 0/22 | |

Medians per set and arm:

| Set | Per arm |
|---|---|
| small | A: 229,880 tok, $0.241, 66 s; B: 252,821 tok, $0.246, 73 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| es-toolkit-e62aa15f | small | A | 2 | yes | 140 | 457,265 | +9/−2 | 3.67 |  |
| hono-e5bb2062 | small | A | 1 | yes | 42 | 149,518 | +1/−1 | 1.00 |  |
| es-toolkit-827b92f7 | small | B | 2 | yes | 87 | 360,082 | +6/−19 | 0.89 |  |
| es-toolkit-3433044c | small | B | 2 | yes | 287 | 762,619 | +10/−3 | 0.36 |  |
| hono-afb2068c | small | A | 2 | yes | 25 | 120,176 | +4/−0 | 1.00 |  |
| es-toolkit-d9574efd | small | A | 2 | yes | 53 | 238,950 | +18/−2 | 1.67 |  |
| hono-e5bb2062 | small | B | 2 | yes | 47 | 156,836 | +1/−1 | 1.00 |  |
| es-toolkit-323893f2 | small | A | 1 | yes | 67 | 199,000 | +13/−7 | 1.54 |  |
| es-toolkit-827b92f7 | small | A | 1 | yes | 62 | 249,650 | +6/−10 | 0.57 |  |
| es-toolkit-15043d8e | small | B | 1 | yes | 108 | 288,668 | +2/−1 | 1.00 | left the sandbox |
| hono-afb2068c | small | B | 1 | yes | 22 | 125,207 | +5/−0 | 1.25 |  |
| es-toolkit-2c4c0478 | small | A | 2 | yes | 119 | 282,550 | +6/−4 | 1.67 |  |
| es-toolkit-827b92f7 | small | A | 2 | yes | 50 | 220,810 | +6/−13 | 0.68 |  |
| es-toolkit-d9574efd | small | B | 1 | yes | 72 | 279,823 | +2/−2 | 0.33 |  |
| es-toolkit-99af1860 | small | B | 1 | yes | 43 | 159,662 | +1/−1 | 1.00 |  |
| hono-e5bb2062 | small | B | 1 | yes | 95 | 158,436 | +1/−1 | 1.00 |  |
| es-toolkit-e62aa15f | small | A | 1 | yes | 163 | 344,743 | +3/−0 | 1.00 |  |
| hono-c3053ccf | small | A | 1 | yes | 67 | 144,947 | +3/−1 | 0.67 |  |
| es-toolkit-d9574efd | small | B | 2 | yes | 74 | 274,487 | +2/−4 | 0.50 |  |
| es-toolkit-99af1860 | small | A | 2 | yes | 43 | 180,678 | +1/−1 | 1.00 |  |
| hono-afb2068c | small | A | 1 | yes | 72 | 145,408 | +2/−0 | 0.50 |  |
| es-toolkit-827b92f7 | small | B | 1 | yes | 119 | 260,406 | +4/−9 | 0.46 |  |
| es-toolkit-e62aa15f | small | B | 1 | yes | 128 | 360,400 | +3/−0 | 1.00 |  |
| es-toolkit-323893f2 | small | A | 2 | yes | 171 | 359,116 | +14/−8 | 1.69 |  |
| hono-c3053ccf | small | B | 1 | yes | 47 | 121,966 | +5/−4 | 1.50 |  |
| es-toolkit-d9574efd | small | A | 1 | yes | 82 | 329,663 | +14/−3 | 1.42 |  |
| es-toolkit-3433044c | small | B | 1 | yes | 256 | 787,903 | +16/−3 | 0.53 |  |
| es-toolkit-3433044c | small | A | 1 | yes | 223 | 836,593 | +16/−3 | 0.53 |  |
| es-toolkit-15043d8e | small | A | 2 | yes | 31 | 159,815 | +2/−1 | 1.00 |  |
| es-toolkit-15043d8e | small | B | 2 | yes | 56 | 259,674 | +2/−1 | 1.00 |  |
| es-toolkit-323893f2 | small | B | 1 | yes | 87 | 271,602 | +13/−7 | 1.54 |  |
| es-toolkit-99af1860 | small | B | 2 | yes | 24 | 131,349 | +1/−1 | 1.00 |  |
| es-toolkit-15043d8e | small | A | 1 | yes | 69 | 321,681 | +4/−1 | 1.67 |  |
| es-toolkit-99af1860 | small | A | 1 | yes | 35 | 181,470 | +1/−1 | 1.00 |  |
| hono-c3053ccf | small | A | 2 | yes | 30 | 92,794 | +3/−1 | 0.67 |  |
| es-toolkit-2c4c0478 | small | B | 1 | yes | 49 | 245,967 | +6/−4 | 1.67 |  |
| es-toolkit-2c4c0478 | small | B | 2 | yes | 74 | 230,278 | +4/−2 | 1.00 |  |
| es-toolkit-3433044c | small | A | 2 | yes | 173 | 589,507 | +16/−3 | 0.53 |  |
| hono-afb2068c | small | B | 2 | yes | 29 | 152,506 | +4/−0 | 1.00 |  |
| es-toolkit-e62aa15f | small | B | 2 | yes | 117 | 644,422 | +2/−0 | 0.67 |  |
| hono-c3053ccf | small | B | 2 | yes | 39 | 121,477 | +5/−4 | 1.50 |  |
| hono-e5bb2062 | small | A | 2 | yes | 25 | 111,942 | +1/−1 | 1.00 |  |
| es-toolkit-323893f2 | small | B | 2 | yes | 70 | 235,600 | +13/−7 | 1.54 |  |
| es-toolkit-2c4c0478 | small | A | 1 | yes | 66 | 301,454 | +4/−2 | 1.00 |  |
