# Real-agent proof

Generated 2026-10-11T08:16:20.888Z. Model claude-opus-5-5. 10 minute limit per run. No token cap.
Arm A is Claude Code alone. Arm B is Claude Code plus the Prism dev pack.
A run succeeds when the tests that failed on the parent commit pass, and the agent did not edit those test files.
Differences are B − A. The interval is a 95% bootstrap and excludes zero only when it is entirely above or below zero.

| | Arm A | Arm B | B − A (95% CI) |
|---|---|---|---|
| Runs | 33 | 33 | |
| Success | 97% | 100% | 3.0 pp (0.0 to 9.1) |
| Tokens, mean | 1,18,241 | 1,46,813 | 28,571 (-1,983 to 57,273) |
| Seconds, mean | 92 | 42 | -50 (-162 to 13) |
| USD, mean | 0.15 | 0.18 | 0.03 (0.01 to 0.06) |

## Per run

| Task | Arm | Run | Success | Seconds | Tokens | Note |
|---|---|---|---|---|---|---|
| hono-e5bb2062 | B | 2 | yes | 47 | 1,24,154 |  |
| hono-e5bb2062 | B | 1 | yes | 23 | 1,28,614 |  |
| hono-afb2068c | B | 3 | yes | 23 | 1,01,876 |  |
| es-toolkit-e62aa15f | A | 1 | yes | 39 | 1,77,637 |  |
| hono-afb2068c | A | 1 | yes | 18 | 88,400 |  |
| es-toolkit-e62aa15f | B | 1 | yes | 48 | 1,77,807 |  |
| es-toolkit-827b92f7 | A | 3 | yes | 40 | 1,42,074 |  |
| es-toolkit-99af1860 | B | 1 | yes | 19 | 83,020 |  |
| es-toolkit-3433044c | A | 3 | yes | 128 | 2,26,858 |  |
| hono-e5bb2062 | A | 2 | yes | 19 | 86,443 |  |
| hono-afb2068c | A | 2 | yes | 16 | 69,420 |  |
| es-toolkit-99af1860 | B | 3 | yes | 20 | 83,094 |  |
| hono-afb2068c | B | 2 | yes | 22 | 1,27,495 |  |
| es-toolkit-15043d8e | A | 1 | no | 1524 | 0 | timed out |
| es-toolkit-3433044c | A | 2 | yes | 427 | 4,14,083 |  |
| es-toolkit-99af1860 | B | 2 | yes | 19 | 83,435 |  |
| hono-c3053ccf | B | 1 | yes | 42 | 2,00,835 |  |
| es-toolkit-2c4c0478 | A | 3 | yes | 51 | 1,09,304 |  |
| es-toolkit-827b92f7 | A | 2 | yes | 30 | 1,23,185 |  |
| hono-c3053ccf | A | 1 | yes | 20 | 83,425 |  |
| es-toolkit-e62aa15f | A | 2 | yes | 30 | 1,54,188 |  |
| es-toolkit-827b92f7 | B | 3 | yes | 38 | 1,68,094 |  |
| hono-afb2068c | A | 3 | yes | 16 | 89,553 |  |
| hono-c3053ccf | A | 3 | yes | 20 | 87,160 |  |
| es-toolkit-323893f2 | A | 1 | yes | 48 | 1,01,153 |  |
| es-toolkit-d9574efd | B | 2 | yes | 22 | 82,647 |  |
| hono-c3053ccf | B | 2 | yes | 24 | 98,636 |  |
| es-toolkit-827b92f7 | A | 1 | yes | 37 | 1,24,726 |  |
| es-toolkit-e62aa15f | B | 3 | yes | 38 | 2,26,776 |  |
| es-toolkit-99af1860 | A | 3 | yes | 17 | 53,739 |  |
| es-toolkit-827b92f7 | B | 1 | yes | 42 | 1,41,305 |  |
| es-toolkit-d9574efd | B | 3 | yes | 27 | 1,06,317 |  |
| hono-afb2068c | B | 1 | yes | 25 | 1,22,951 |  |
| es-toolkit-d9574efd | A | 2 | yes | 23 | 74,016 |  |
| es-toolkit-323893f2 | B | 1 | yes | 58 | 1,43,338 |  |
| es-toolkit-3433044c | B | 2 | yes | 68 | 1,60,379 |  |
| es-toolkit-e62aa15f | A | 3 | yes | 33 | 1,57,117 |  |
| es-toolkit-15043d8e | A | 2 | yes | 23 | 78,552 |  |
| es-toolkit-15043d8e | B | 3 | yes | 51 | 1,59,742 |  |
| es-toolkit-d9574efd | A | 3 | yes | 27 | 92,071 |  |
| es-toolkit-2c4c0478 | B | 3 | yes | 58 | 1,53,504 |  |
| es-toolkit-2c4c0478 | B | 2 | yes | 58 | 1,75,579 |  |
| es-toolkit-15043d8e | B | 2 | yes | 35 | 1,36,166 |  |
| es-toolkit-827b92f7 | B | 2 | yes | 45 | 1,70,974 |  |
| es-toolkit-3433044c | B | 1 | yes | 63 | 1,63,185 |  |
| es-toolkit-323893f2 | B | 3 | yes | 59 | 1,44,421 |  |
| es-toolkit-d9574efd | B | 1 | yes | 32 | 1,29,815 |  |
| es-toolkit-3433044c | A | 1 | yes | 105 | 2,63,459 |  |
| es-toolkit-e62aa15f | B | 2 | yes | 106 | 3,17,003 |  |
| hono-e5bb2062 | B | 3 | yes | 33 | 1,31,409 |  |
| es-toolkit-323893f2 | B | 2 | yes | 59 | 1,43,501 |  |
| es-toolkit-2c4c0478 | B | 1 | yes | 60 | 1,77,339 |  |
| es-toolkit-323893f2 | A | 2 | yes | 52 | 1,23,336 |  |
| hono-c3053ccf | A | 2 | yes | 29 | 1,26,409 |  |
| es-toolkit-15043d8e | A | 3 | yes | 27 | 95,440 |  |
| es-toolkit-99af1860 | A | 2 | yes | 15 | 53,578 |  |
| es-toolkit-99af1860 | A | 1 | yes | 13 | 53,697 |  |
| es-toolkit-2c4c0478 | A | 2 | yes | 26 | 95,266 |  |
| es-toolkit-d9574efd | A | 1 | yes | 20 | 72,599 |  |
| es-toolkit-3433044c | B | 3 | yes | 61 | 1,68,793 |  |
| hono-e5bb2062 | A | 1 | yes | 17 | 86,555 |  |
| es-toolkit-15043d8e | B | 1 | yes | 39 | 1,60,738 |  |
| hono-c3053ccf | B | 3 | yes | 31 | 1,51,874 |  |
| hono-e5bb2062 | A | 3 | yes | 25 | 86,741 |  |
| es-toolkit-323893f2 | A | 3 | yes | 46 | 1,02,738 |  |
| es-toolkit-2c4c0478 | A | 1 | yes | 71 | 2,09,045 |  |
