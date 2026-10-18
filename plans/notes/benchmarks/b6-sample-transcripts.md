# B6 sample transcripts: same task with and without Prism

Claude Code, isolated HOME, local Prism 2.0 build. Arm A: host alone. Arm B: host + Prism pack (MCP, hooks, skills).
Tokens are session totals from the transcripts (every API call), not the last-turn figure `-p` reports. Credentials are redacted.

## es-toolkit-e62aa15f: es-toolkit, B used 64% more tokens

Task prompt (same for both arms):

```text
Tests listed below fail on this checkout. Fix the source so they pass.
Do not edit test files, snapshots, or skip any test. Do not push or open a pull request.
Stop when those tests pass.

Failing tests:
- benchmarks/bundle-size/zipObject.spec.ts
- src/compat/array/zipObject.spec.ts
```

### Without Prism (arm A)

Tokens 117,093 (input 12, cache read 103,028, cache write 12,608, output 1,445) · cost $0.150 · 34 s · 6 API calls · success yes

Injected context (chars; arm A has only the host's own skills): prompt hook 0, session hook 0, skill listing 7,202, MCP instructions 0.

Tool calls, in order:

1. `Bash: cd  cat benchmarks/bundle-size/zipObject.spec.ts; cat src/compat/array/zipObject.ts; git show --stat HEAD | he`
2. `Bash: cd  git show HEAD; yarn vitest run benchmarks/bundle-size/zipObject 2>&1 | tail -30`
3. `Bash: cd  grep -n bundle package.json benchmarks/package.json 2>/dev/null; ls benchmarks/bundle-size | head; ls benc`
4. `Bash: cd  python3 - <<'EOF'`
5. `Bash: cd  git status --short; git diff`

Final response (first 15 lines):

```text
I fixed `src/compat/array/zipObject.ts`, and both target tests now pass. I didn't edit any test or snapshot files.

**The bug:** the compat `zipObject` had default parameters (`= []`), but defaults only kick in for `undefined`, not `null`. So `zipObject(null)` crashed with "Cannot read properties of null (reading 'length')". Lodash returns `{}` in that case.

**The fix:** two lines at the top of the function body turn `null` keys or values into empty arrays:

```ts
keys = keys ?? [];
values = values ?? [];
```

So `zipObject(null, [1, 2])` now returns `{}`, and `zipObject(['a', 'b'], null)` returns `{ a: undefined, b: undefined }`.

**Results:**
- `src/compat/array/zipObject.spec.ts`: all tests pass, including the new null-handling test.
```

### With Prism (arm B)

Tokens 192,143 (input 16, cache read 174,785, cache write 15,404, output 1,938) · cost $0.197 · 68 s · 8 API calls · success yes

Injected context (chars; arm A has only the host's own skills): prompt hook 1,292, session hook 1,159, skill listing 9,140, MCP instructions 3,625.

Tool calls, in order:

1. `Bash: cd  cat src/compat/array/zipObject.ts; cat benchmarks/bundle-size/zipObject.spec.ts; cat src/compat/array/zipO`
2. `Bash: cd  git show HEAD -- benchmarks; yarn vitest run src/compat/array/zipObject.spec.ts benchmarks/bundle-size/zip`
3. `Bash: cd  python3 - <<'EOF'`
4. `Bash: cd  ls benchmarks/bundle-size; grep -n bundle package.json vitest.config.* 2>/dev/null`
5. `Bash: cd  ls benchmarks; cat benchmarks/package.json 2>/dev/null | head -30; cat benchmarks/bundle-size/utils/getBun`
6. `Bash: cd benchmarks; yarn vitest run bundle-size/zipObject.spec.ts 2>&1 | grep -E "✓|×|Expected|Received|Tests|^\s+[`
7. `Bash: cd  git stash -q; (cd benchmarks; yarn vitest run bundle-size/zipObject.spec.ts 2>&1 | grep -E "Tests|Expected`

Final response (first 15 lines):

```text
I fixed `zipObject` in compat mode so a `null` for keys or values is treated as an empty array, like lodash does. Both target test files pass now.

**The bug:** the default parameters in `src/compat/array/zipObject.ts` only apply when an argument is `undefined`, not `null`. So `zipObject(null)` crashed when it tried to read `keys.length`.

**The fix:** I added two lines at the top of the function:
```ts
keys = keys ?? [];
values = values ?? [];
```

**Test results:**
- `src/compat/array/zipObject.spec.ts`: 9 of 9 pass. Before the change, the "should treat null keys and values as empty arrays" test failed.
- `benchmarks/bundle-size/zipObject.spec.ts`: 3 of 3 pass. Run it from `benchmarks/` with `yarn vitest run bundle-size/zipObject.spec.ts`; the root `yarn vitest run` doesn't include it. Before the fix the compat bundle was 265 bytes against the expected 281, and the extra null handling brings it to exactly 281.

No test files were edited, and nothing was committed or pushed.
```

**Why the difference:** Every arm-B API call starts about 3.9k tokens larger (first call 19,969 vs 16,029 prompt tokens): the Prism rules from the SessionStart and prompt hooks, five Prism skills in the skill listing, and the MCP server instructions plus deferred tool list. B also made 8 API calls instead of 6, because it dug into the benchmarks/ bundle-size harness and ran a `git stash` before/after check. Each extra call re-reads the whole cached context, so cache reads went from 103k to 175k. B called no Prism tool: the auto-prepare pack hit the 1 s hook deadline and was skipped, and the agent ignored the rule telling it to call `prepare_change`.

## hono-afb2068c: hono, B used 51% more tokens

Task prompt (same for both arms):

```text
Tests listed below fail on this checkout. Fix the source so they pass.
Do not edit test files, snapshots, or skip any test. Do not push or open a pull request.
Stop when those tests pass.

Failing tests:
- src/middleware/combine/index.test.ts
```

### Without Prism (arm A)

Tokens 88,885 (input 10, cache read 78,909, cache write 8,567, output 1,399) · cost $0.112 · 35 s · 5 API calls · success yes

Injected context (chars; arm A has only the host's own skills): prompt hook 0, session hook 0, skill listing 6,739, MCP instructions 0.

Tool calls, in order:

1. `Bash: cd  npx vitest run src/middleware/combine/index.test.ts 2>&1 | grep -E "FAIL|✗|×|Error|expected" | head -30; c`
2. `Bash: cd  grep -n "short-circuits" -A25 src/middleware/combine/index.test.ts`
3. `Bash: cd  python3 - <<'EOF'`
4. `Bash: cd  npx vitest run src/middleware/combine/ 2>&1 | grep -E "Tests|Test Files"`

Final response (first 15 lines):

```text
I fixed it: `src/middleware/combine/index.test.ts` now passes (16 of 16 tests), and type-checking shows no errors in the combine module.

**Cause:** In `some()` in `src/middleware/combine/index.ts`, a middleware can stop the chain early by returning a Response (for example `c.json(..., 400)`). `some()` stopped running later middleware but threw that Response away. Since nothing reached the context, Hono gave up with "Context is not finalized" and returned a 500 instead of the 400.

**Fix:** When a middleware returns a Response, `some()` now saves it, breaks out of the loop as before, and returns it. Hono then uses it as the reply. Nothing else in `some()` changed: errors, condition functions and `next()` calls behave as before.

I only ran this one test file, not the full suite. Nothing was committed or pushed.
```

### With Prism (arm B)

Tokens 134,413 (input 12, cache read 119,825, cache write 13,478, output 1,098) · cost $0.154 · 31 s · 6 API calls · success yes

Injected context (chars; arm A has only the host's own skills): prompt hook 1,292, session hook 1,159, skill listing 8,677, MCP instructions 3,625.

Tool calls, in order:

1. `Bash: cd  cat src/middleware/combine/index.ts; npx vitest run src/middleware/combine/index.test.ts 2>&1 | tail -60`
2. `Bash: cd  sed -n 125,155p src/middleware/combine/index.test.ts`
3. `Bash: cd  cat src/compose.ts | sed -n 1,80p`
4. `Edit src/middleware/combine/index.ts`
5. `Bash: cd  npx vitest run src/middleware/combine/index.test.ts 2>&1 | tail -6`
6. `Bash: cd  npx vitest run src/middleware/combine/index.test.ts 2>&1 | grep -E "Tests|Test Files"`

Final response (first 15 lines):

```text
I fixed the bug, and all 16 tests in `src/middleware/combine/index.test.ts` now pass. Before the fix, 15 passed and one failed.

**Cause:** The `some()` middleware ignored a Response returned by a middleware that ends the request early (for example, `async (c) => c.json({...}, 400)`). Because the response was never set on the context, Hono raised "Context is not finalized" and sent a 500 instead of the expected 400.

**Fix:** In `src/middleware/combine/index.ts`, when a handler inside `some()` returns a Response and the context isn't already finalized, the code now sets it as `c.res`. This matches what `compose` does for ordinary middleware. It's a 2-line change and I didn't touch any test files.

I only ran this one test file, not the full suite.
```

**Why the difference:** Same fixed overhead (first call 18,650 vs 14,707 prompt tokens) plus one extra API call: B also read `src/compose.ts` to copy how `compose` sets `c.res`. No Prism tool was called. Both fixes pass; B's is closer to the existing `compose` pattern.

## es-toolkit-827b92f7: es-toolkit, the closest pair (B +42%)

Task prompt (same for both arms):

```text
Tests listed below fail on this checkout. Fix the source so they pass.
Do not edit test files, snapshots, or skip any test. Do not push or open a pull request.
Stop when those tests pass.

Failing tests:
- src/compat/array/intersectionBy.spec.ts
```

### Without Prism (arm A)

Tokens 104,704 (input 10, cache read 89,828, cache write 13,062, output 1,804) · cost $0.159 · 47 s · 5 API calls · success yes

Injected context (chars; arm A has only the host's own skills): prompt hook 0, session hook 0, skill listing 7,202, MCP instructions 0.

Tool calls, in order:

1. `Bash: cat src/compat/array/intersectionBy.ts && yarn vitest run src/compat/array/intersectionBy.spec.ts 2>&1 | tail `
2. `Bash: sed -n 130,182p src/compat/array/intersectionBy.spec.ts; ls src/compat/util/iteratee.ts; grep -l "iteratee(" s`
3. `Bash: python3 - <<'EOF'`
4. `Bash: yarn eslint src/compat/array/intersectionBy.ts && yarn vitest run src/compat/array 2>&1 | tail -4`

Final response (first 15 lines):

```text
I fixed `src/compat/array/intersectionBy.ts`, and all 22 tests in `src/compat/array/intersectionBy.spec.ts` now pass. I didn't touch any test files.

**The bug:** `getIteratee` only recognized functions and string keys as the iteratee. Anything else came back as `null`, and then the intersection step was skipped, so the first array was returned without being filtered. That broke three cases lodash handles:
- **Number keys:** `123` should mean "look up property 123", which makes every element map to `undefined`.
- **Nullish iteratee:** `null` or `undefined` should behave as identity (compare the values themselves).
- **Object shorthand:** `{ x: 1 }` should mean "keep elements matching `{ x: 1 }`".

**The fix:** functions are still wrapped so they get called with one argument. Every other value now goes through the compat `iteratee` helper, which already turns these shorthands into functions the way lodash does. Because there is now always an iteratee, I removed the `null` checks.

The full `src/compat/array` suite still passes (963 tests), and ESLint shows no errors. It gives three `no-explicit-any` warnings: two were already in the file, and one is from the `value as any` cast I added when calling the helper.
```

### With Prism (arm B)

Tokens 148,350 (input 12, cache read 129,997, cache write 16,448, output 1,893) · cost $0.195 · 79 s · 6 API calls · success yes

Injected context (chars; arm A has only the host's own skills): prompt hook 1,292, session hook 1,159, skill listing 9,140, MCP instructions 3,625.

Tool calls, in order:

1. `Bash: cat src/compat/array/intersectionBy.ts && yarn vitest run src/compat/array/intersectionBy.spec.ts 2>&1 | tail `
2. `Bash: sed -n 135,182p src/compat/array/intersectionBy.spec.ts; ls src/compat/util/iteratee.ts`
3. `Bash: sed -n 1,200p src/compat/util/iteratee.ts | grep -v '^ \*' | head -60; grep -rn "intersectionBy" src --include`
4. `Bash: python3 - <<'EOF'`
5. `Bash: yarn eslint src/compat/array/intersectionBy.ts 2>&1 | tail -5; yarn tsc --noEmit 2>&1 | tail -5`

Final response (first 15 lines):

```text
I fixed `src/compat/array/intersectionBy.ts`, and all 22 tests in `src/compat/array/intersectionBy.spec.ts` now pass.

**Cause:** when the last argument wasn't a function or a string, the code didn't treat it as an iteratee. So `null`, numbers like `123` or `0`, and objects like `{ x: 1 }` were dropped as iteratees, and no matching was done against the other arrays.

**Fix:** non-function iteratees now go through compat's own `iteratee` helper, which is what lodash does. That means:
- `null` or `undefined` compares values directly (identity).
- A number or string is read as a property name.
- An object matches elements that have the same properties.
- A two-item array like `['x', 1]` matches on that property and value.

Functions are still called with only the element as an argument, as before. I also removed the `property` import, which is no longer used.

`tsc --noEmit` passes. ESLint reports no errors on the file, only two `no-explicit-any` warnings on the function's `any` parameters, which were already there. I didn't edit any test files, and nothing was committed or pushed.
```

**Why the difference:** Same tool path for the first two steps. B made one extra read of `src/compat/util/iteratee.ts` plus a grep for callers and ran `tsc`, giving 6 calls vs 5 on a 3.9k-token-larger prefix (19,974 vs 16,033). No Prism tool was called.
## Across all 44 sessions

- Median first-call prompt: **16,033** tokens without Prism vs **19,974** with it (+3.9k per API call, cached after the first).
- Median API calls: 5 (A) vs 6 (B). Tokens are mostly cache reads, so each extra call costs roughly the whole context again.
- **0 of 22** arm-B sessions called any Prism MCP tool. In Claude Code 2.1 the MCP tools are deferred (they have to be found through tool search first), and the auto-prepare pack mostly missed its 1 s deadline while the daemon re-indexed after the harness's per-task `git checkout`. So arm B paid for Prism's context and got none of its answers.

## How the pairs were chosen

- Pairs are matched on task id and run number in `plans/notes/benchmark-real-agents/runs-2x.enriched.jsonl`, and each row's `sessionId` locates its transcript under the isolated HOME's `.claude/projects` (`scripts/bench/b6-transcripts.mjs`). The first two pairs are typical (B +51% and +64%); the third is the closest pair with clean transcripts.
- Bash commands are cut at 100 characters, and the worktree path after `cd` is removed. No credentials, OAuth data or API keys appear in any transcript; the copied sign-in was deleted after the run.
- Token figures here are transcript totals. Claude Code's `-p` JSON reports a smaller figure for some sessions: es-toolkit-3433044c arm B run 2 reported 42,571 tokens, but its transcript sums to 752,430 over 41 assistant messages and 29 Bash calls (no subagents). The cause of the under-report isn't confirmed. The published proof uses transcript totals for every session.

## Why arm B wasn't cheaper

1. **Fixed overhead on every call.** Prism adds about 3.9k tokens to each API call's prompt: the SessionStart and prompt hooks (2.4k chars), five Prism skills in the skill listing (about 2k chars) and the MCP server instructions (3.6k chars). Because sessions are mostly cache reads, that prefix is paid again on every call.
2. **The agent never used Prism.** 0 of 22 arm-B sessions called a Prism MCP tool. Claude Code defers MCP tools behind tool search, so `prepare_change` isn't visible until the agent searches for it, and the always-on rule saying "call prepare_change" doesn't make it do so. It explored with `cat`, `sed`, `grep` and `git show` exactly as arm A did.
3. **Prism was degraded in almost every arm-B session.** The isolated `~/.prism/events.jsonl` (from the 12:31 IST restart on) shows the prompt hook skipped auto-prepare on its 1 s deadline in 21 of 22 prompts, and the stop hook got no receipt from the daemon in 20 of 22 sessions ("daemon silent", /v1/receipt timed out). In the same window the daemon logged 162 checkout events and 235 snapshot writes: the harness's per-task `git checkout` kept it re-indexing. So the agent paid for Prism's rules and got neither its context pack nor its Guard receipt.
4. **Slightly more exploration.** With the extra rules about proof, arm B tended to make one more call (read a neighbouring file, run `tsc` or a wider test set). Median 6 API calls vs 5. Each extra call re-reads the whole cached context.
