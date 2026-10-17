# Real-agent proof

Generated 2026-10-17T11:38:48.953Z. Host claude, model claude-opus-5-5. 10 minute limit per session. No token cap.
Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.

## Quality and precision

### small (3 A / 2 B sessions)

| | Arm A (no Prism) | Arm B (Prism, lens automatic) |
|---|---|---|
| Correct: the failing tests pass, tests untouched | 3/3 | 2/2 |
| Blind grade, correctness (1–5) | – | – |
| Blind grade, minimal code (1–5) | – | – |
| Blind grade, house style (1–5) | – | – |
| Grader preferred, against arm A (wins–losses, ties left out) |  | 0–0 of 0 |
| Change size vs the maintainers' fix, median (1.00 = same) | 1.00 | 0.58 |
| Sessions that added a new source file | 0 | 0 |
| Sessions breaking the repo's lint/format where upstream passes | 0/3 | 0/2 |
| Sessions breaking a nearby test that passes upstream | 0/2 | 0/1 |
| Sessions that read outside the checkout or its history | 0 | 0 |

## Cost

Small set (the earlier es-toolkit + hono tasks), B − A with a 95% bootstrap interval:

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 3 | 2 | |
| Success | 100% | 100% | 0.0 pp (0.0 to 0.0) |
| Tokens, mean | 112,380 | 211,271 | 98,891 (73,625 to 124,157) |
| Seconds, mean | 37 | 45 | 9 (-12 to 29) |
| USD, mean | 0.15 | 0.19 | 0.03 (0.02 to 0.05) |
| Tokens, median | 116,992 | 211,271 | |
| Sessions calling a Prism tool | | 0/2 | |

Medians per set and arm:

| Set | Per arm |
|---|---|
| small | A: 116,992 tok, $0.149, 33 s; B: 211,271 tok, $0.187, 45 s |

## Per run

| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |
|---|---|---|---|---|---|---|---|---|---|
| hono-afb2068c | small | B | 1 | yes | 33 | 196,435 | +2/−0 | 0.50 |  |
| es-toolkit-99af1860 | small | A | 1 | yes | 33 | 125,719 | +1/−1 | 1.00 |  |
| hono-afb2068c | small | A | 1 | yes | 27 | 94,429 | +4/−0 | 1.00 |  |
| hono-c3053ccf | small | A | 1 | yes | 50 | 116,992 | +5/−4 | 1.50 |  |
| hono-c3053ccf | small | B | 1 | yes | 58 | 226,107 | +3/−1 | 0.67 |  |
