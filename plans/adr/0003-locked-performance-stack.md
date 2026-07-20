# ADR-0003: Locked performance-oriented toolchain

| Field | Value |
|---|---|
| Status | **LOCKED** (owner confirmed 2026-07-20; Master Plan **APPROVED** 2026-07-20) |
| Date | 2026-07-20 |
| Decision makers | Owner |
| Related milestones | M-001, M-006, M-009, M-018 |
| Supersedes | ADR-0002 defaults for lint + parts of Master Plan v0.1 stack |

## Decision (owner-selected)

| Layer | Choice |
|---|---|
| Package manager | Bun |
| Node engine | ≥ 26 (pin latest 26.x) |
| Monorepo task runner | **moonrepo** |
| JS/TS parser (v1) | **Oxc parser** (SWC as fallback note) |
| Multi-lang later | Tree-sitter (M-034) |
| Graph library | **ngraph** (+ layout helper as needed) |
| Local DB | **better-sqlite3** |
| Map UI | **React Flow** |
| Lint / format | **Oxlint + Oxfmt** |
| Tests | Vitest (+ Playwright later) |
| Bundler | Vite |
| Git hooks | **Lefthook** (not Husky) |
| CI | GitHub Actions (local-first; push optional) |

---

## moonrepo vs Turborepo

| | **moonrepo** (chosen) | **Turborepo** |
|---|---|---|
| Focus | Task runner + **toolchain pinning** (Node/Bun versions) | Simple JS/TS task cache |
| Config | Explicit `moon.yml` / project configs | Minimal `turbo.json` |
| Polyglot | Strong (JS, Rust, Go, Python, …) | JS/TS-centric |
| Cache | Local + remote (moonbase / self-host); toolchain in cache key | Local + Vercel remote; file-hash centric |
| Ecosystem | Smaller than Turbo/Nx | Very common in TS monorepos |
| Learning curve | Low–medium | Lowest |

**Pros of moon for Prism:** reproducible Bun/Node versions across contributors/CI; room for Rust/native bits later; stricter task graph.  
**Cons:** less “default” docs/examples than Turbo; slightly more YAML ceremony; cache hits stricter when toolchain versions differ.

---

## Oxc / SWC vs ts-morph vs Tree-sitter

| | **Oxc parser** (chosen v1) | **SWC** | **ts-morph** | **Tree-sitter** |
|---|---|---|---|---|
| Parse speed | Excellent (Rust) | Excellent | Slower (TS program) | Excellent + incremental |
| TypeScript semantics | Syntax AST; limited types | Syntax-oriented | **Full TS program** | Syntax only |
| DX for analysis | Good with custom layers | Good | Best for TS refactor-grade | Good multi-lang |
| Same family as Oxlint/Oxfmt | **Yes** | No | No | No |
| Multi-language | JS/TS family | JS/TS family | TS/JS only | **Best** |

**Pros of Oxc for Prism:** indexing throughput; aligns with Oxlint/Oxfmt; enough structure for deps/symbols v1.  
**Cons:** weaker than ts-morph for type-accurate references; may need optional TS checker path later for hard semantic cases.  
**SWC:** similar speed class; prefer Oxc for toolchain cohesion unless a SWC API is clearly better for a subproblem.  
**Tree-sitter:** keep for **M-034** multi-lang, not JS/TS v1 primary.  
**ts-morph:** optional later “deep TS” mode if reference resolution quality demands it (not default).

---

## ngraph vs graphology

| | **ngraph** (chosen) | **graphology** |
|---|---|---|
| Performance / memory | Generally leaner for large graphs | Fine mid-size; richer API overhead |
| API style | Minimal, performance-oriented | Richer graphology ecosystem |
| Layout | Separate packages (e.g. ngraph.* / own dagre bridge) | graphology-layout / dagre integrations common |
| Community | Solid for viz/network use | Strong in JS analysis tooling |

**Pros of ngraph:** speed/memory for dependency + semantic graphs at repo scale.  
**Cons:** more DIY for algorithms/layouts; fewer batteries than graphology.

---

## better-sqlite3 vs Bun sqlite vs others

| | **better-sqlite3** (chosen) | **Bun `sqlite`** | **libsql** | **DuckDB** |
|---|---|---|---|---|
| Sync perf | Excellent | Excellent in Bun | Excellent | Excellent analytics |
| Node extension host | **Works** (native addon) | Bun-only API risk | Works | Works (heavier) |
| Portability Core→VS Code | **Best fit** | Risky if Core assumes Bun APIs | Good | Overkill for KV index |
| Ops complexity | Native compile / ABI | Simple in Bun | Extra server optional | Heavier binary |

**Pros of better-sqlite3:** fastest practical sync SQLite for Node-compatible Core shared with extensions.  
**Cons:** native compilation; must match Node ABI in CI.  
**Bun sqlite:** great if everything were Bun-only — rejected because extension host is Node.  
**libsql:** consider later if embedded replica features needed.  
**DuckDB:** not for primary index cache.

---

## React Flow vs Cytoscape vs Canvas/WebGL

| | **React Flow** (chosen) | **Cytoscape.js** | **Canvas / WebGL** (Sigma, custom) |
|---|---|---|---|
| DX with React | Best | Good (wrapper needed) | Most work |
| Perf at 100–2k nodes | Good with clustering | Strong | Best |
| Perf at 10k+ nodes | Needs aggressive aggregation | Better | Best |
| Interaction / IDE webview | Excellent | Good | Custom everything |

**Pros of React Flow:** ships Map faster; fits playground + VS Code webview; clustering covers v1.  
**Cons:** not the ceiling for huge unclustered graphs — mitigate with zoom aggregation (M-017/M-035), not by blocking on WebGL day one.

---

## Oxlint + Oxfmt vs other fast linters/formatters

| Tooling | Relative speed | Notes |
|---|---|---|
| **Oxlint + Oxfmt** (chosen) | Top tier | Lint + format; Oxc family |
| Biome | Very fast (often slightly behind Ox) | One tool simplicity |
| ESLint + Prettier | Much slower | Plugin ecosystem |
| dprint | Fast format | Format only |
| Rome (legacy) | — | Superseded by Biome |

No widely adopted stack is clearly **faster and more complete** than Oxlint+Oxfmt for JS/TS lint+format in 2026. Biome is the main “almost as fast, simpler” alternative.

---

## Lefthook vs Husky (+ lint-staged)

| | **Lefthook** (chosen) | **Husky** |
|---|---|---|
| Language | Go binary; YAML | npm package + shell |
| Speed / parallelism | Fast; parallel hooks | Adequate |
| Monorepo | Excellent | Common but heavier node_modules coupling |
| Works with Bun | Yes | Yes |

**Choice:** Lefthook for fast, language-agnostic hooks without tying hooks lifecycle to npm package install quirks.

Typical hooks:

- `pre-commit`: oxfmt + oxlint on staged; typecheck optional (or affected only)
- `commit-msg`: conventional commits (optional)
- `pre-push`: `moon run :verify` / `bun run verify:milestone` (optional; can be CI-only)

---

## CI checks (planned)

GitHub Actions (when remote exists; still valid locally via `act` optional):

1. **Setup** — Bun + Node 26 (moon toolchain)
2. **Install** — `bun install --frozen-lockfile`
3. **Lint/format** — `oxlint` + `oxfmt --check`
4. **Typecheck** — `moon run :typecheck` (or turbo-equivalent task)
5. **Unit tests** — Vitest
6. **Integration tests** — Vitest integration
7. **Build** — all packages
8. **verify:milestone** — full gate
9. Later: Playwright e2e, extension smoke, perf budgets, CodeQL/security audit

**Local = CI philosophy:** `bun run verify:milestone` must match CI jobs.

---

## Consequences

- M-001 scaffolds moon + Oxlint/Oxfmt + Lefthook (not Turbo/Biome/Husky)
- M-006 builds Oxc-based analyzer (not ts-morph-first)
- M-009 uses ngraph
- M-034 remains Tree-sitter multi-lang
- Deep TS mode (ts-morph or `tsc` program) is a future optional ADR if semantic quality requires it
