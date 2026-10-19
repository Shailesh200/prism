# Prism 2.0 — precision plan

The person this is for installs Prism once, as an MCP server, and does not think about it again. A normal request ("fix the due date", "add maxAge to cors", "this PR") should arrive with the right files, the real dependents, and one way of working. The dashboard, the CLI, and the pull-request comment must show those same facts.

This plan covers the gaps found by running the local build on hono, preact, rentmaadi, and this repo. It does not cover the packages already on npm.

## Rules for every fix

- No special case for a repository, a filename, or a word we happened to test.
- One definition of each fact. The score, the band, the card, and the dashboard all read it. Cycles, orphans, and "affected" each have one definition too.
- Prism still does not call a model. Ranking, routing, and resolution stay deterministic.
- A tool the agent must remember to call is not part of the everyday path. The everyday path is the session hook plus the daemon.
- Done means the real prompts below, on the real repositories, return the file a developer would open first. New unit tests lock those cases. They do not replace them.

## 0. What "done" is

Re-run these on fresh clones, against the build this plan produces. Each line names the file that must be first, or the fact that must be true.

| Repository | Task | Must be true |
|---|---|---|
| hono | add a `maxAge` option to the cors middleware | `src/middleware/cors/index.ts` is first. Its test is the test, not a list of other middleware tests. |
| es-toolkit | trailing debounce call should use the latest arguments | `src/function/debounce.ts` is first, with `debounce.spec.ts`. |
| rentmaadi | on the due day the tenant dashboard shows next month | `apps/web/src/lib/dateUtils.ts` is first. Blast radius lists the three pages that import it. |
| preact | hydration mismatch between server and client text | `src/render.js` is in the first few files. `demo/zustand.jsx` is not. |
| hono | how does `src/hono.ts` reach `src/compose.ts` | The path already returned stays. |
| hono | health | Test presence follows the test-file ratio. Coupling is one number. A type-only import loop is not reported as a cycle to break. |
| any | "review this PR" / "review the change before I open a PR" | Architect. Evidence is the changed files. |
| any | "find bugs in debounce" while other files are dirty | QA. Evidence is debounce, not the dirty files. |
| rentmaadi | change `dateUtils.ts`, Action comment | The three importing pages are affected. The comment and the CLI review match. |
| rentmaadi | Claude Code: "on the due day the tenant dashboard shows next month" | The prompt hook attaches `dateUtils.ts` and the Dev lens before the first edit. The stop hook writes a receipt within a few seconds. Envelope shows the Prepare call. The agent is not told the receipt failed. |

## 1. Install once

Today the daemon starts only if a Claude Code hook runs, Cursor's agent does not see the server, and an old MCP process keeps serving a stale index.

**Daemon is part of the server, not a second install.** The MCP process ensures the daemon before the first tool call and before the prompt hook returns. Cursor, Claude Code, and the CLI then share one index. The Claude Code hook can stay; it is not the only way the daemon starts.

**The hook is the product.** On a prompt that asks for a change, the hook runs Prepare and attaches the result: files, the one lens, and the one-line blast of those files. The agent does not have to call `prepare_change`. On a question ("how does A reach B"), the hook does not attach a change pack. That distinction already exists as a requirement on M-093; it has to be true in the hook, with a test for both kinds of sentence.

**The hook uses the same binary as the server.** On that rentmaadi session the prompt hook logged "no local server for auto-prepare" and the agent fixed `dateUtils.ts` without calling a Prism tool. Envelope stayed empty. The hook looks for `mcp-server/dist/bin.js` two and three directories above the pack's `hooks/` folder, and otherwise gives up. From `dist/dev-pack/hooks` that file is four directories up, so the lookup misses. `PRISM_MCP_BIN` is set on the MCP process only, not on the hook. The prompt hook then skips Prepare. The stop hook falls through to `npx @repo-prism/mcp-server`, which is not this build. The pack records the binary next to the hook, and both the prompt hook and the stop hook run that binary. There is no `npx` fallback.

**The prompt waits for the daemon.** Session start said "still indexing." The daemon finished 389 ms later. Once the hook has the binary, it waits until the daemon can answer for this workspace, bounded by a few seconds, and then runs Prepare. "Still indexing" is allowed once. A skipped pack is not.

**Edit hooks say a fact or nothing.** The same session's before-edit and after-edit hooks answered "warming" and did not mention blast radius. "Warming" is not a result the agent should see. If the index is not ready, the hook is silent. If it is ready, the hook reports the blast of that file or says the file is outside the pack.

**The receipt is structural and fast.** The stop hook ran to its 110 second timeout and wrote nothing. The agent was told Prism could not build a receipt; it described the error as a workspace path ending in `/stop`. The receipt is the changed files, their dependents, and which tests reach them. That returns in seconds. Running the repo's test command is a separate step and must not block the receipt. No `node_modules` means "checks not run," not a timeout and not a failed receipt. A second stop in the same turn does not spawn the receipt again; the first result is what the agent sees, including when the first result is a receipt.

**Skills name only tools the default server has.** `prism-lens` must not tell the agent to call `review_with` unless `review_with` is registered by default. Prefer the hook injecting the lens, so the skill is a description of behavior the hook already applied.

**The install the editor actually reads.** Cursor's agent and Claude Code do not share one config. The documented Cursor install has to be the file that `cursor-agent` and the IDE both load (project `.cursor/mcp.json`, or the user file the CLI reads). Acceptance is `cursor-agent mcp list` showing Prism's six tools and a prompt that receives the hook pack. Claude Code's plugin is a copy or a link that the pack build cannot delete out from under a running install: the build writes the new pack beside the old one and replaces it only after the new one is complete.

**Index progress is one line, not one line per chunk.** A 579-file index emitted a notification every 25 files into the client. The client gets started, finished, and failure. Chunk ticks stay on the daemon log.

**Acceptance.** A new MCP client, with no extra environment variable, gets a fresh index within one prompt. A second prompt about an edit just made sees that edit. No `PRISM_MCP_FULL`. The transcript of that index is a handful of lines, not dozens. The rentmaadi Claude Code row in section 0 passes: the prompt context names `dateUtils.ts` before the edit, and `prism receipts` shows a receipt for that session.

## 2. Prepare returns the file the task is about

`buildPrepareChange` gives the same bonus to every path token. In "cors middleware", `middleware` matches every middleware file, and `cors` adds the same 0.22. Colocation, recent edits, and ownership then outrank the file that actually contains cors. The budget walker keeps that wide list and `fitPrepareToBudget` drops reuse, house style, and the work order to get back under 2,000 tokens. The estimate can still finish over the budget, which is how 2,010 and 2,500 token answers happened.

**Rank by how rare a token is.** A token that occurs in two paths outranks a token that occurs in eighty. This is ordinary inverse document frequency over the index's paths and symbol names, computed once per index and reused. No list of important words.

**A distinctive token is a seed.** Seeds already pull import-neighbors in. Once `cors` is rare enough to seed `src/middleware/cors/index.ts`, its test and its importers follow by import distance, which is the term that should beat "recently edited".

**Tests do not outrank the source they test.** A colocated test gets its bonus only after its source is in the pack, and it is listed as a test, not as a peer of the source. The current `tests` array is the right place. The pack's `files` stay source.

**The budget keeps the best section of each kind.** Reserve a fixed share of the 2,000 tokens for reuse, house style, and the work order before filling the file list. Cut the file list first. Never report `tokenEstimate` above the budget: the fit step must be a hard cap, not a best effort. The over-budget alarm in Envelope should then stay quiet for a normal Prepare.

**House style has to be true once it is kept.** Reserving tokens does not make the exemplars right. An exemplar is a file that declares the same kind of thing as the change and sits in the same package. It is not a recently edited file that merely shares a token. The rentmaadi due-date pack, with the budget fixed, names a page or helper beside `dateUtils.ts`, or it names none. It does not name an unrelated route.

**Acceptance.** The four Prepare rows in section 0. Reuse for the rentmaadi due-date task still includes `getNextRentDueDate` / the rent helpers when they are real; it is not dropped to make room for unrelated routes. House style, when present, matches the rule above.

## 3. Resolve imports the way the compiler does

Alias imports (`@/lib/dateUtils`) and package subpaths (`@repo-prism/shared/lens-store`) never become edges, so blast radius, test impact, and the graph are blind to them. Type-only imports become ordinary edges and then "measured" cycles.

**One resolver, used by the indexer.** For each file, resolve every specifier with, in order: relative path, `package.json` `imports` and `exports`, tsconfig/jsconfig `paths`, then `node_modules` types only when the package is a workspace package. Record the resolved file and whether the import is type-only or value. Do not add a special case for `@/`.

**Cycles use value edges only.** A cycle that exists solely because of `import type` is not a cycle. Say so in the report by not listing it. Keep the type edge on the graph if a caller asks for types; the default cycle list is value imports.

**A folder explain is the files inside it.** `explain` on `src/router` returned no edges because it looked up the folder as if it were a file. After resolution, a folder's incoming and outgoing counts are the files it contains, and the summary names what those files are. Domain stays empty when classification is genuinely unsure. It does not say "not confidently classified" for a folder whose files are the router.

**Stack detection keys off dependencies and entry files.** A JSX runtime is not React. hono was labeled React and primary domain "tooling" because the detector treated JSX and a monorepo layout as the product. The primary domain is the domain of the files the root package actually runs. Extra lockfiles are reported as present, not collapsed into one package manager when the root has a different one.

**Acceptance.** rentmaadi: three pages are importers of `dateUtils.ts`. This repo: `tools/lenses.ts` has an edge to the lens store. hono: the `types.ts` loop is not in the cycle list. A real value cycle, if one remains, still is. `explain` of `src/middleware/cors` names the middleware and its test. hono's DNA does not say React.

## 4. Blast radius is symbol reach, plus a clearly marked config hint

File-level edges through a barrel make a one-function change look like it touches hundreds of files. Config globs (`src/**`) make every file look covered by tsconfig and CI.

**Affected code** means: a file that imports a symbol defined in the changed file, or imports a symbol whose body reaches one of those symbols, within the existing hop limit. Importing a barrel for a different export does not count. The hop walk already exists; it has to walk symbols, which the graph already stores as `declares`.

**Config and CI stay in a separate list**, labeled as pattern matches, and they do not add to the risk number. Risk is computed from the code list only.

**Test impact uses that same walk.** A test counts only when it imports the changed symbol or a symbol that reaches it. Preact's diff file must not list every test that imports `src/index.js` for an unrelated export. Debounce's tests are the debounce specs, not `nth.spec.ts`.

**`find` returns one row per declaration.** `parseBody` came back as three identical methods in `src/request.ts`, with no line. Each row is one declaration, with its line, and a re-export points at the file that defines it instead of repeating the name.

**Safe-delete and rename use that same walk.** They are not default MCP tools, and they were not part of the agent sessions. They are still commands a person can run. `safe-delete` says a file is safe only when the symbol walk finds no code dependents. `rename` lists every file that walk finds, not every importer of a barrel. On rentmaadi, renaming `getNextRentDueDate` lists the three pages. On hono, deleting `src/middleware/cors/index.ts` is not safe, because its test imports it.

**Acceptance.** Debounce's code blast is the compat wrapper, the throttle that calls it, and the debounce tests, not 353 files. Cors's code blast is its test. `dateUtils.ts` lists the three pages. The Action comment shows that code list. `find parseBody` has one row for the function in `src/utils/body.ts` and one for each real method, with lines. The rename and safe-delete checks above pass.

## 5. Health, orphans, and the first-run card

**Test presence is the ratio of test files to source files**, the formula already written in `computeHealthScore`. A missing coverage artifact is a separate line, "coverage not measured", not a substitute score of 35. The testing report may display coverage when an artifact exists. It must not replace test presence.

**Coupling has one number, and it is a share.** rentmaadi's density was 3.29, which is not a density. The number is edges divided by the maximum a graph of that size can have, so it stays between 0 and 1. The band is derived from that share. Cycles are a count next to it, not a hidden input that sets the score to 0 while the band says low.

**Parse health is parse failures and skipped files.** Unresolved imports are their own count. Do not add them into a score called parse health. The hono sentence "458/579 files analyzed" belongs with the index coverage, not with health.

**An orphan is a source file with no importers and no entry-point role.** Entry points are `package.json` `main`, `bin`, and `exports`, plus a file referenced by a literal URL or path string from another indexed file (`/sw.js`). Config files, lockfiles, and vendored tool SDKs are not orphans and are not "source". Fixture packages that are members of this repo stay in this repo's graph; they are real packages here. Do not hide names that contain "fixture". The noise to remove is non-source files and unresolved package ids (`pkg:…`): a package id is the `name` field, and a folder with no name is not a package.

**The first-run card** prints for `prism` and for `prism --no-open`. `--no-open` only skips the browser. The "what holds the score down" list includes a factor only when its score is under a stated line (the card can use 80). It never prints 100 there.

**Acceptance.** hono health: test presence near the top of the scale, coupling band and score agree, no type-only cycle, domain not "React" unless a React dependency is actually imported by the app (hono's JSX runtime is not React). es-toolkit's card does not lead with `.prettierrc.cjs`. rentmaadi's card does not call `sw.js` an orphan.

## 6. Lenses

The lens is a short procedure attached to the prompt, not a tool the agent has to remember and not a second copy of the procedure in the tool result.

**Selection stays `chooseLens`, with two wording fixes and no new keyword lists.** "Review" plus "pull request", "PR", or "this change" is Architect, including "review the uncommitted change before I open a PR". A bug hunt still wins when the sentence is "find bugs in this PR". Add those phrases to the existing Architect pattern. Do not add a synonym table.

**Evidence follows the task.** If the sentence is about the working tree or a PR, evidence is the changed files, as it is now. Otherwise evidence is the top of the Prepare pack from section 2, after that pack is trustworthy. Building evidence from whatever happens to be dirty is why "find bugs in debounce" discussed `some.ts`.

**One statement of the procedure.** The brief carries it once. The stored definition is the source. The screen reads that field. Do not also paste it into a second instruction string.

**Upgrades must not rename a lens the owner renamed.** Fill an empty `procedure` on a seeded lens. Replace role and checklist only when they still equal the previous shipped text *and* the name still equals the shipped name. "Prism Architect" stays "Prism Architect".

**Default server.** Keep `review_with` and `lens` off the default list. The hook injects the chosen lens. `review_with` remains available when the full tool list is on, for someone who wants a stored verdict. The stop hook does not invent a verdict.

**A duplicate finding is a second implementation, not a re-export.** Dev's evidence called hono's `template` a duplicate of the same function re-exported from the barrel. A finding counts only when two bodies match. A re-export is the same symbol.

**Acceptance.** The three lens rows in section 0, on a fresh Prism home and on a home where the lenses were renamed. The Lenses screen shows the procedure that was injected. The template re-export does not appear as a duplicate.

## 7. Dashboard

The dashboard is a view of the objects above. It does not compute a second health, a second envelope, or a second skill list.

- **Envelope.** Iris and `prism envelope` both show the ledger: calls, tokens in, over budget, and "saved" as "not calibrated" until a study says otherwise. Delete the "Sent %" cards, or define them as a labeled breakdown of one ledger row. No "−92.4pp" without the two numbers that produced it. Remove "Not job tokens".
- **Iris.** The subtitle describes the cards on the page. Host connectors that are not signed in are not listed as connected. "0 of 0" is an empty state ("no files packed"), not a statistic.
- **Skills.** The list is the skills in the installed pack (the five shipped, plus any the user added on disk). The sentence is "Skills your editor can follow", not "workflows Prism can run". The screen does not read Dispatch.
- **Graph.** It is part of Impact, as the view of "what this file touches", not a tenth tab and not a button that leaves Overview highlighted. The view shows the measured edges from section 4, not only a list of filenames. A file with no edges says so in the inspector. Fixture noise goes away because section 5 fixed packages and orphans, not because the screen filters names.
- **The browser dashboard uses the browser navigation.** The playground shell currently uses the icon rail meant for a narrow IDE sidebar, and a second repository bar sits above every screen. In the browser the nav is the labeled sidebar the screens were built for, and the repository control lives in that sidebar's header. One Prism mark.
- **Trends.** The default range is the range that contains the history. An empty chart says "no health recorded yet" only when that is true.
- **Overview.** One Prism mark. One "last indexed". A factor at 100 is not drawn as a failure. "Indexed" links to index coverage, not to Envelope.
- **DNA.** No jobs chip. Entropy, drift, and debt each say what a higher number means, in the label they already have room for.

**A remembered fact stays in the repo it was saved for.** `prism remember` was not exercised. A note saved while the workspace is rentmaadi shows up in the next Prepare for rentmaadi and does not appear in a Prepare for hono.

**Acceptance.** Screenshots at 1440px of Overview, Iris, Skills, Impact (with the graph), and Trends, on this repo and on rentmaadi, after a fresh index of each. The numbers match `prism health` and `prism envelope` for that same Prism home. The remembered-fact check above passes.

## 8. The pull-request Action

- Cache `~/.prism/workspaces` for the repo, or set `PRISM_HOME` to a directory the Action caches. Caching `.prism` inside the checkout does nothing.
- The comment's affected files are the code blast from section 4. It does not say 0 tests when three pages import the file.
- The receipt's verdict is the checks that ran. "Unknown" is not a verdict. When the stop hook has no session, it writes nothing, which is the CI case in the next bullet. When it has a session, the verdict is proven, not proven, or failed, from those checks.
- The receipt block is omitted when there is no receipt. It is not an empty section and not an error in the log. A CI review has no agent session, so "no receipt" is the normal case. Wording: do not print "No receipts yet" into the job log as a failure.

## 9. Shipping this build

Versions on this branch match versions already published, while the source has changed. The publish script will skip `shared`, `core`, `intelligence`, `mcp-server`, `cli`, and `plugin`. The only new packages would be `checks` and `daemon`. Anyone on `@latest` would stay on the old server, because the self-update compares version strings.

Before a 2.0 publish:

- Bump every package whose source changed, and `daemon`, together. `daemon` and `core` publish before `mcp-server` and `cli`, which the order in `publish-npm.mjs` already does once the versions are new.
- The export check treats a subpath import (`@repo-prism/core/envelope`, `@repo-prism/daemon/server`) like a named import. A package that would be skipped while its source differs from the published tarball fails the check. Today's check stays green only because it ignores skipped packages.
- `npm install` of the packed set is the install test, on Node 24.18.1. The `better-sqlite3` allow-scripts warning is noted in the install doc if a fresh machine can refuse the install script; the prebuild has to be enough.
- The install doc matches this build: Node 24.18.1, six default tools, index under `~/.prism/workspaces`, and the Cursor config the agent CLI loads. It does not say Node 26 or seven tools.

## Order

1. **Resolver and cycles** (section 3). Blast, test impact, and Prepare's import distance are wrong until imports resolve.
2. **Prepare ranking and budget** (section 2). Depends on real edges.
3. **Symbol blast and the Action comment** (sections 4 and 8).
4. **Health, orphans, first-run card** (section 5).
5. **Daemon-on-MCP, hook injection, lens evidence and wording** (sections 1 and 6).
6. **Dashboard wired to those objects** (section 7).
7. **Version bumps and the publish check** (section 9), last, after the answers are the ones in section 0.

Each step is done when its rows in section 0 pass on hono, preact, and rentmaadi. A green unit suite is not a substitute.
