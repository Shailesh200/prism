# B6 token-fix A/B: same task with and without Prism

Source: `plans/notes/benchmark-real-agents/runs-tf.jsonl` (44 sessions, Claude Code, claude-opus-5-5, run started 17:14 IST on Oct 15).
Transcripts: `/private/tmp/prism-ab/home/.claude/projects/*/<sessionId>.jsonl`. Without Prism = arm A, with Prism = arm B.
Both pairs below passed in both arms. Across all 22 with-Prism sessions the agent made **0 Prism tool calls**. Prism only took part through the note it adds automatically to the prompt.
Token totals include cache reads: each step re-sends the whole conversation, so the number of steps drives the total.

---

## Pair 1: Prism used FEWER tokens (es-toolkit-15043d8e)

**Prompt (both arms):** "Tests listed below fail on this checkout. Fix the source so they pass. Do not edit test files, snapshots, or skip any test. Do not push or open a pull request. Stop when those tests pass. Failing tests: src/compat/array/orderBy.spec.ts, src/compat/array/sortBy.spec.ts"

**What Prism added to the prompt (arm B, 1,198 chars):**
```
Prism · prepare (auto) for "Tests listed below fail on this checkout. Fix the source so they pass. ..."
src/compat/array/orderBy.ts (matches src, compat, array, order, named in task)
 10: type Criterion<T> = ((item: T) => unknown) | PropertyKey | PropertyKey[] | null | undefined;
 139: function orderBy<T = any>(collection: any, criteria?: any, orders?: any, guard?: unknown): T[]
Tests: src/compat/array/orderBy.spec.ts, src/compat/array/sortBy.spec.ts, src/array/at.spec.ts, ...chunk.spec.ts
Run: yarn vitest run src/compat/array/orderBy.spec.ts src/compat/array/sortBy.spec.ts ...
This is prepare_change's answer; do not call it again for this task. ...
```

**Without Prism (A, session 02d8f385)**
1. Bash: run the 2 failing tests + `git show --stat HEAD` → "should not include the `length` property for array-like objects"
2. Bash: `git show HEAD` (test diff) + `cat src/compat/array/orderBy.ts` + grep in sortBy.ts
3. Bash: check `isArrayLike` exists and how countBy.ts uses it
4. Bash: python edit to orderBy.ts, then run the whole `src/compat/array` folder (91 files, 950 tests)
- Final: "Fixed in orderBy.ts... array-likes are now converted with `Array.from`... full src/compat/array suite passes."

**With Prism (B, session 8a22539d)**
1. Bash: run the 2 failing tests **and** `cat src/compat/array/orderBy.ts` in the same call (the file Prism named)
2. Bash: grep the failing test in orderBy.spec.ts + `ls isArrayLike.ts`
- Text: "Array-like objects should be iterated by index, matching lodash."
3. Bash: python edit to orderBy.ts, then run only the 2 failing files (40 tests pass)
- Final: "Both test files pass now... array-like inputs are now converted with `Array.from`... I only ran those two files, not the full suite."

**Change (same in both arms):** in `orderBy.ts`, `collection = isArrayLike(collection) ? Array.from(collection) : Object.values(collection);` plus the import.

| | Without Prism | With Prism |
|---|---|---|
| Total tokens | 107,128 | 89,905 (−16%) |
| Output tokens | 1,123 | 1,019 |
| Cost | $0.132 | $0.126 |
| Time | 50 s | 29 s |
| Tool calls | 4 | 3 |
| Source files opened | 1 (orderBy.ts) + test diff | 1 (orderBy.ts) |

**Why:** Prism's note named the right file up front, so the agent opened it in its very first step and skipped one round of looking around. That saved a whole step, and every step re-sends the full conversation. It also ran only the 2 failing test files instead of the whole folder. The other run without Prism on this task used 233k tokens over 12 tool calls, so the gap here is on the small side.

---

## Pair 2: Prism used MORE tokens (es-toolkit-3433044c)

**Prompt (both arms):** same wording. Failing tests: benchmarks/bundle-size/zipObjectDeep.spec.ts, src/compat/object/updateWith.spec.ts, tests/__proto__.spec.ts

**What Prism added to the prompt (arm B, 1,709 chars, trimmed):**
```
Prism · prepare (auto) for "Tests listed below fail on this checkout. ..."
benchmarks/bundle-size/utils/getBundleSize.ts (unresolved import, matches benchmark, bundle, size)
  4: async function getBundleSize(   13: async function getBundleSizeFromScript(script: string)
src/compat/array/zipObjectDeep.ts (matches zip, object, deep, src, named in task)
src/compat/object/updateWith.ts (matches object, src, compat, update, named in task)
src/compat/_internal/stubFour.ts (matches src, compat, named in task)
src/compat/_internal/stubThree.ts (matches src, compat, named in task)
[body of getBundleSize, 8 lines]
Tests: ...zipObjectDeep.spec.ts, updateWith.spec.ts, __proto__.spec.ts, bundle-size/add.spec.ts, camelCase.spec.ts
Run: yarn vitest run src/compat/object/updateWith.spec.ts tests/__proto__.spec.ts
Run: cd benchmarks && yarn vitest run bundle-size/zipObjectDeep.spec.ts ...
```
(The key file, updateWith.ts, is 3rd. The top pick is a measuring script, and 2 picks, stubFour/stubThree, are noise.)

**Without Prism (A, session 1e3f1bbd), 11 tool calls**
1. Bash: `git show --stat HEAD` + run the 3 failing tests
2. Bash: `git show HEAD` + `cat updateWith.ts` + run the bundle-size test
3. Bash: cat set.ts, zipObjectDeep.ts imports, isUnsafeProperty.ts
4. Bash: python edit to updateWith.ts (stop on `__proto__`/`constructor`/`prototype`), run tests → behavior tests pass
5–7. Bash: bundle-size test still off: "Expected 3200, Received 3163"; cat getBundleSize.ts; git log
8–9. Bash: `curl` upstream updateWith.ts and isUnsafeToWriteProperty.ts from GitHub
- Text: "Upstream solved this with a dedicated `isUnsafeToWriteProperty` helper; adopting the same approach."
10–11. Bash: write the helper + switch updateWith, run tests; `tsc --noEmit` OK
- Final: "All three failing tests pass now... New helper isUnsafeToWriteProperty.ts..."

**With Prism (B, session 9c509ceb), 21 tool calls**
1. Bash: `git show --stat` + cat updateWith.ts, zipObjectDeep.ts, zipObjectDeep.spec.ts (files from Prism's note)
2–3. Bash: `git show HEAD`, cat set.ts, isUnsafeProperty.ts, grep its users
4. Bash: python edit to updateWith.ts (same first fix as A), run tests → behavior tests pass
5. Bash: cat getBundleSize.ts + run bundle-size test → 3163 vs 3200
6–8. Bash: write a temporary esbuild script, inspect the minified bundle by hand
9. Bash: **`find /` for published es-toolkit copies (76 s)**. Found copies in other folders on the Mac (e.g. ~/portfolio/node_modules, temp caches)
10–14. Bash: read the published 1.50.0 `updateWith.mjs`, `zipObjectDeep.mjs`, `set.mjs`; bundle them → also 3163, dead end
15. Bash: `gh api ...` → gh not installed
16–19. ToolSearch, WebFetch ×2 (upstream files from GitHub), ls `src/_internal`
- Text: "Upstream adds a dedicated `isUnsafeToWriteProperty` helper. I'll mirror that."
20–21. Bash: write the helper + switch updateWith, run tests; lint
- Final: "All three failing tests pass now... New src/_internal/isUnsafeToWriteProperty.ts..."

**Change (same in both arms):** new `src/_internal/isUnsafeToWriteProperty.ts` (`__proto__`, `constructor`, `prototype`), and `updateWith.ts` now returns early on those keys instead of skipping them.

| | Without Prism | With Prism |
|---|---|---|
| Total tokens | 303,096 | 659,179 (+117%) |
| Output tokens | 3,930 | 7,439 |
| Cost | $0.278 | $0.489 |
| Time | 216 s | 337 s |
| Tool calls | 11 | 21 |
| Files opened | ~5 repo files + 2 upstream | ~6 repo files + 4 published-package files + 2 upstream |

**Why:** Both runs made the same first fix and both then got stuck on the bundle-size number. The run without Prism went straight to the upstream source and finished in 11 steps. The run with Prism dug through local copies of the package first: it searched the whole disk and bundled old releases before reaching the same upstream answer. Those 10 extra steps, each re-sending a growing conversation, account for almost all of the difference. Prism's note didn't cause the detour, but it didn't help either: it put a measuring script first, named 2 irrelevant stub files, and never pointed at the real answer. The other with-Prism run on this task used 213k tokens, less than both runs without Prism, so this pair is mostly run-to-run variation on a hard task.

---

## Takeaways
- Prism helps when its note names the right file first: one search round is skipped (pair 1).
- On harder tasks the note is ignored after step 1, and the agent never calls Prism tools. The cost is decided by how the agent searches (pair 2).
- Noise in the note (stub files, a measuring script ranked first) is cheap in characters but gives no help. Trimming low-confidence picks is the clear fix.
- Side note: in pair 2 the agent ran `find /` and read files outside the test folder (e.g. ~/portfolio). It only read them, but the A/B sandbox does not stop this.
