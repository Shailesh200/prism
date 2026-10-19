# Real-agent proof

Generated 2026-10-15T07:57:11.627Z. Model claude-opus-5-5. 10 minute limit per run. No token cap.
Arm A is Claude Code alone. Arm B is Claude Code plus the Prism dev pack.
A run succeeds when the tests that failed on the parent commit pass, and the agent did not edit those test files.
Differences are B − A. The interval is a 95% bootstrap and excludes zero only when it is entirely above or below zero.

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 22 | 22 | |
| Success | 95% | 91% | -4.5 pp (-18.2 to 9.1) |
| Tokens, mean | 130,678 | 131,578 | 900 (-54,885 to 46,006) |
| Seconds, mean | 65 | 79 | 15 (-22 to 58) |
| USD, mean | 0.16 | 0.20 | 0.04 (-0.01 to 0.09) |

## Per run

| Task | Arm | Run | Success | Seconds | Tokens | Note |
|---|---|---|---|---|---|---|
| es-toolkit-e62aa15f | A | 2 | yes | 34 | 117,093 |  |
| hono-e5bb2062 | A | 1 | yes | 32 | 87,851 |  |
| hono-afb2068c | A | 2 | yes | 35 | 88,885 |  |
| es-toolkit-d9574efd | A | 2 | yes | 61 | 95,441 |  |
| es-toolkit-323893f2 | A | 1 | yes | 64 | 102,886 |  |
| es-toolkit-827b92f7 | A | 1 | yes | 88 | 262,377 |  |
| es-toolkit-2c4c0478 | A | 2 | yes | 91 | 129,684 |  |
| es-toolkit-827b92f7 | A | 2 | yes | 47 | 104,704 |  |
| es-toolkit-827b92f7 | B | 2 | yes | 134 | 213,368 |  |
| es-toolkit-3433044c | B | 2 | yes | 398 | 42,571 |  |
| hono-e5bb2062 | B | 2 | no | 40 | 102,650 |  |
| es-toolkit-15043d8e | B | 1 | yes | 54 | 144,911 |  |
| hono-afb2068c | B | 1 | yes | 31 | 134,413 |  |
| es-toolkit-d9574efd | B | 1 | yes | 38 | 89,269 |  |
| es-toolkit-99af1860 | B | 1 | yes | 41 | 66,490 |  |
| hono-e5bb2062 | B | 1 | yes | 112 | 139,632 |  |
| es-toolkit-e62aa15f | A | 1 | yes | 35 | 117,810 |  |
| hono-c3053ccf | A | 1 | yes | 19 | 85,451 |  |
| es-toolkit-d9574efd | B | 2 | yes | 27 | 88,529 |  |
| es-toolkit-99af1860 | A | 2 | yes | 34 | 54,717 |  |
| hono-afb2068c | A | 1 | yes | 25 | 69,994 |  |
| es-toolkit-827b92f7 | B | 1 | yes | 79 | 148,350 |  |
| es-toolkit-e62aa15f | B | 1 | yes | 68 | 192,143 |  |
| es-toolkit-323893f2 | A | 2 | yes | 110 | 105,253 |  |
| hono-c3053ccf | B | 1 | yes | 56 | 132,296 |  |
| es-toolkit-d9574efd | A | 1 | yes | 24 | 72,507 |  |
| es-toolkit-3433044c | B | 1 | yes | 119 | 242,929 |  |
| es-toolkit-3433044c | A | 1 | yes | 195 | 541,087 |  |
| es-toolkit-15043d8e | A | 2 | yes | 33 | 96,544 |  |
| es-toolkit-15043d8e | B | 2 | yes | 37 | 120,542 |  |
| es-toolkit-323893f2 | B | 1 | yes | 161 | 180,839 |  |
| es-toolkit-99af1860 | B | 2 | yes | 41 | 66,544 |  |
| es-toolkit-15043d8e | A | 1 | no | 94 | 75,997 |  |
| es-toolkit-99af1860 | A | 1 | yes | 29 | 54,693 |  |
| hono-c3053ccf | A | 2 | yes | 20 | 85,098 |  |
| es-toolkit-2c4c0478 | B | 1 | yes | 60 | 140,073 |  |
| es-toolkit-2c4c0478 | B | 2 | no | 82 | 134,454 |  |
| es-toolkit-3433044c | A | 2 | yes | 223 | 349,486 |  |
| hono-afb2068c | B | 2 | yes | 25 | 112,093 |  |
| es-toolkit-e62aa15f | B | 2 | yes | 49 | 191,307 |  |
| hono-c3053ccf | B | 2 | yes | 28 | 85,187 |  |
| hono-e5bb2062 | A | 2 | yes | 72 | 87,939 |  |
| es-toolkit-323893f2 | B | 2 | yes | 68 | 126,125 |  |
| es-toolkit-2c4c0478 | A | 1 | yes | 60 | 89,421 |  |
