# Replay benchmark

Generated 2026-10-14T07:55:28.385Z. Method: SZZ-lite replay. A catch is a typecheck/test failure absent on the clean parent, or a Guard/blast flag on a file the later fix touched. The same flag on a control is a false alarm..

| | Count |
|---|---|
| Regressions replayed | 9 (1 unrunnable) |
| Caught by a check that passed before the change | **6** |
| Missed | 2 |
| Catch rate (runnable) | 75% |
| Regressions with a Guard / blast flag on a file the fix touched | 6 |
| Controls replayed | 8 (0 unrunnable) |
| False alarms (control failed a check that passed before) | **4** |
| False-alarm rate (runnable) | 50% |
| Median receipt time | 4.2 s |

## Cases

| Repo | Kind | Commit | Outcome | Verdict | Tests | Why |
|---|---|---|---|---|---|---|
| es-toolkit | regression | `77144455` refactor(compat/lastIndexOf): use internal toArray helper fo | caught | failed | 46 (full-script) | flag: duplicate:src/compat/array/lastIndexOf.ts, boundary:src/compat/array/lastIndexOf.ts |
| es-toolkit | regression | `6b1e88c2` refactor(compat/dropRightWhile): use toArray instead of Arra | caught | failed | 42 (full-script) | flag: duplicate:src/compat/array/dropRightWhile.ts |
| es-toolkit | control | `50339c32` feat(predicate): add isEmptyObject function (#1584) | false-alarm | failed | 48 (full-script) |  |
| es-toolkit | control | `f49fd5b4` feat(forOwnRight): Implement `compat/forOwnRight` (#1147) | false-alarm | failed | 29 (full-script) |  |
| zod | regression | `install` install failed | unrunnable | clean | 0 (none) | Command failed: npm ci --no-audit --no-fund |
| hono | regression | `8a5852d4` fix(etag): resolve incorrect incremental hashing for chunked | missed | failed | 1 (scoped) |  |
| hono | regression | `2159deb4` feat(etag): support conditional requests for the QUERY metho | caught | failed | 1 (scoped) | flag: orphan:src/middleware/etag/index.ts |
| hono | regression | `fab3b136` Merge commit from fork | caught | failed | 21 (scoped) | flag: duplicate:src/jsx/components.ts, duplicate:src/jsx/components.ts, duplicate:src/jsx/components.ts, duplicate:src/j |
| hono | regression | `fa5f9bfc` Merge commit from fork | missed | failed | 6 (scoped) |  |
| hono | regression | `6a0607a9` Merge commit from fork | caught | failed | 60 (scoped) | flag: duplicate:src/utils/url.ts, high-blast:src/utils/url.ts |
| hono | regression | `69f303e0` feat(client): Add  `ApplyGlobalResponse` type helper for RPC | caught | failed | 17 (scoped) | flag: duplicate:src/client/types.ts, duplicate:src/client/types.ts, duplicate:src/client/types.ts, duplicate:src/client/ |
| hono | control | `3098a3ab` perf(urls): refactor `tryDecodeURIComponent` (#5158) | false-alarm | failed | 60 (scoped) |  |
| hono | control | `c285f9a4` chore(benchmark): add app.fetch() overhead benchmark (#5117) | false-alarm | failed | 0 (none) |  |
| hono | control | `6cbb025f` Merge commit from fork | quiet | failed | 60 (scoped) |  |
| hono | control | `66daa2ed` Merge commit from fork | quiet | failed | 21 (scoped) |  |
| hono | control | `58825a72` feat(jsx-renderer): support function-based options (#4780) | quiet | failed | 1 (scoped) |  |
| hono | control | `bf37828d` feat(basic-auth): add context key and callback options (#464 | quiet | failed | 7 (scoped) |  |
