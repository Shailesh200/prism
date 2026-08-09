# Owner smoke checklist — Completion Program (M-053 … M-063)

Work is on branch `milestone/M-053-presentation-consolidation`.  
`bun run verify:milestone` is green. Smoke each surface before you approve commits/merge.

Prereqs: `bun install`, Node ≥ 22, open this repo (or a TS fixture) as the workspace.

---

## 0. Boot

```bash
# Playground
bun run --filter @repo-prism/playground dev

# Website (optional)
bun run docs:dev

# CLI sanity
bun run --filter @repo-prism/cli build
node packages/cli/dist/cli.js doctor
node packages/cli/dist/cli.js doctor --ci
```

Extension: run **Run Extension** (F5) from `packages/vscode-extension`, open a folder.

---

## 1. M-053 — Presentation consolidation

| # | What to verify | How |
|---|---|---|
| 1.1 | Domains open without crashing | Playground/extension → Domains → open each of the six domains |
| 1.2 | Frontend uses Core report | Frontend domain shows routes/breakdown after open; run Lab or import Lighthouse — UI updates |
| 1.3 | CWV lab vs field labels | Frontend CWV tiles show **Lab (Lighthouse)** / **Field (CrUX)** |
| 1.4 | GitHub CI / PageSpeed consent | Settings → allow network → Integrations → GitHub / PageSpeed connect; without consent, actions refuse |
| 1.5 | MCP/CLI marked available | Integrations: MCP Server and CLI are **available** (not Coming soon) |
| 1.6 | Domains loading honesty | Hard-refresh Domains: while DNA loads see “Detecting…”; count excludes synthetic DevOps |
| 1.7 | Testing scores | Testing & Security before Analyze: `—` without `/100` |
| 1.8 | Retry buttons | Trends: force a git error if possible → **Try again**; Blast: bad path then fix → **Try again** |
| 1.9 | Keyboard / a11y | Tab through Overview, Domains, Blast; Escape closes modals; focus returns |

---

## 2. Number / label honesty (N-xx + M-056)

| # | What to verify | How |
|---|---|---|
| 2.1 | Map inspector | Select a node → **Test proximity** (not “Test coverage”); **Activity (recent edits)** as `NN / 100` (no `%`) |
| 2.2 | Overview files total | Overview Graph Size / totals: file count non-zero at feature zoom |
| 2.3 | Most connected kinds | “Most connected” shows package/feature kinds when not files |
| 2.4 | Unresolved imports | `prism deps --json` includes `unresolvedImports`; Overview/health mentions them if any |
| 2.5 | Git truncation | Large-history repo: activity/Trends note “scanned latest 2,000 of N” when truncated |
| 2.6 | Truncation UI | Overview regions / symbol zoom / blast forward deps show “showing N of M” when capped |
| 2.7 | Graph coverage | Health / Overview show **graph coverage %** and **TS/JS import coupling** |
| 2.8 | Blast limitations | Blast report lists **coverage limitations** (DI, registries, …) |

---

## 3. M-057 — Daily loop (IDE hero)

| # | What to verify | How |
|---|---|---|
| 3.1 | Watch without panel | Open folder; edit a `.ts` file **without** opening Prism panel; status bar should move toward stale/reindex (Auto Re-Index default **On**) |
| 3.2 | Review all changes | Command Palette → **Prism: Review All Changes**; SCM title menu entry |
| 3.3 | Blast Quick Pick | **Prism: Blast Radius (Quick Pick)** or `Cmd/Ctrl+Alt+B` on a file → risk + dependents; optional open full Impact |
| 3.4 | CodeLens | TS/JS file: Blast / Ownership / Map lenses visible (default on) |
| 3.5 | Keybindings | `Cmd/Ctrl+Alt+R` → review all |
| 3.6 | First-index toast | Wipe `.prism` in a test folder, reopen → toast offers **Open Prism** once |
| 3.7 | CLI progress | `prism index` (TTY): phase/file progress on stderr |
| 3.8 | Completions | `prism completions zsh` prints a script |
| 3.9 | Config file | Write `.prism/config.json` with exclude glob; CLI/extension honour it |
| 3.10 | Doctor CI | Shallow clone: `prism doctor --ci` warns |

---

## 4. M-058 — MCP hero

| # | What to verify | How |
|---|---|---|
| 4.1 | review without paths | MCP: call `review_changes` with only `base` (or omit paths) — auto-discovers |
| 4.2 | changed_paths | Tool returns working-tree / base paths |
| 4.3 | Compact JSON | Response is compact (not pretty); `PRISM_MCP_PRETTY=1` pretty-prints |
| 4.4 | Bounded graphs | `dependency_graph` / `knowledge_graph` with limits; KG without path+limit errors |
| 4.5 | workspace_status | Returns indexedAt / git / cache |
| 4.6 | search_symbols | Partial name finds symbols |
| 4.7 | capabilities | Lists available vs consent-gated |
| 4.8 | Resources | Read `prism://dna`, `prism://landmarks`, `prism://health` |
| 4.9 | Install | Website `/benchmarks` or docs MCP install → Cursor deeplink / copy JSON |

---

## 5. M-059 — Reference precision

| # | What to verify | How |
|---|---|---|
| 5.1 | Homonyms | `find_symbol` / refs on a common name without path → ambiguous candidates (not a silent union) |
| 5.2 | Member calls | Blast on a class method used as `obj.method()` — dependents appear |
| 5.3 | require() | CJS fixture: `require('./x')` edges present |
| 5.4 | Barrels | `export *` barrel: refs resolve to defining module |
| 5.5 | tsconfig paths | Alias via `extends` + `baseUrl` resolves |
| 5.6 | .d.ts | Declaration-file imports are type-only in blast |

---

## 6. M-060 — CI / PR

| # | What to verify | How |
|---|---|---|
| 6.1 | Local SARIF | `node packages/cli/dist/cli.js review --format sarif > /tmp/r.sarif` — valid JSON |
| 6.2 | Dogfood Action | Open a PR from this branch; workflow `prism-review` runs; sticky comment + artifact |
| 6.3 | Docs | `docs/guides/wire-into-ci` shows Action + cache + SARIF upload |

---

## 7. M-061 — Detection quality

| # | What to verify | How |
|---|---|---|
| 7.1 | Negative fixtures | DNA on a docs/`k8s` folder or react-in-devDeps repo should **not** confidently claim those stacks |
| 7.2 | Flat src features | Repo with no `features/` dirs still gets inferred features (lower confidence) |
| 7.3 | Backend extractors | Fixture with tRPC / GraphQL / proto / `app.use` mount shows endpoints in Backend domain |

---

## 8. M-062 — UI actionability

| # | What to verify | How |
|---|---|---|
| 8.1 | Profile merged | No separate **Codebase Profile** nav; DNA has profile content; score says **Health Score** |
| 8.2 | Overview actions | Domain chips open domain; region row → map; most-connected → blast; commits actionable |
| 8.3 | Blast open file | Click an affected path → opens in editor (extension) / host |
| 8.4 | Soon pills | Integrations “soon” items are pills/links, not disabled buttons |
| 8.5 | Tools nav | Sidebar Tools → Change Review + Explain |
| 8.6 | Playground default | Fresh playground lands on **Map** after index |
| 8.7 | Sync wording | Buttons say Fetch remote git / Build history / Re-index (not ambiguous “Sync”) |

---

## 9. M-063 — Distribution / marketing

| # | What to verify | How |
|---|---|---|
| 9.1 | Benchmarks page | `bun run docs:dev` → `/benchmarks` loads sample + MCP install panel |
| 9.2 | Whats-new | `/whats-new` shows completion-program post |
| 9.3 | CHANGELOG | Root CHANGELOG has 1.1.0 section |
| 9.4 | Re-run bench | `bun run bench:orientation` regenerates notes |

---

## 10. Owner-only (outside repo)

From `apps/website/OWNER_HANDOFF.md` + M-063:

1. Vercel import (`apps/website` root, monorepo include)
2. Domain DNS → `https://www.prismhq.in`
3. `NEXT_PUBLIC_SITE_URL`
4. Protect `/admin`
5. MCP Registry: `packages/mcp-server/REGISTRY.md` (`mcp-publisher publish`)
6. Tag Action `v1` when ready for external consumers

---

## Known deferred (intentional)

- **P-D1** DomainScreen file split into per-domain section files (analysis already in Core; UI still one large file)
- **P-D6 / P-D8** Map file-zoom virtualisation + unified DataTable
- **Deep TypeScript** — ADR-0034 **reject for now**
- **Language expansion (tree-sitter)** — next planning cycle
