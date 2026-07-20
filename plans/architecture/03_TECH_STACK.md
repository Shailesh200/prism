# Prism — Tech Stack (locked)

| Field | Value |
|---|---|
| Status | **LOCKED** |
| ADR | [`../adr/0003-locked-performance-stack.md`](../adr/0003-locked-performance-stack.md) |
| Audience | All implementers |

This document is the engineer-facing stack guide. ADR-0003 holds the decision record and comparisons.

---

## 1. Stack at a glance

| Layer | Choice | Pin / note |
|---|---|---|
| Language | TypeScript (strict) | Entire monorepo |
| Runtime | Node.js ≥ **26** | Extension host is Node; pin 26.x via `.nvmrc` + moon |
| Package manager | **Bun** | Install + scripts; `bun.lock` |
| Task runner | **moonrepo** | Toolchain pinning + task graph |
| JS/TS parser (v1) | **Oxc parser** | M-006 |
| Multi-lang later | **Tree-sitter** | M-034 |
| Optional deep TS | ts-morph / `tsc` | Only if Oxc refs insufficient |
| Graphs | **ngraph** | M-009 |
| Local DB | **better-sqlite3** | Node-native; not Bun-only sqlite |
| Map UI | React + **Vite** + Tailwind + **React Flow** + Zustand | M-018 |
| MCP | Official MCP SDK | M-026 |
| CLI | Commander | M-028 |
| Test | **Vitest** (+ Playwright later) | |
| Lint / format | **Oxlint + Oxfmt** | |
| Git hooks | **Lefthook** | |
| CI | GitHub Actions | Mirrors `bun run verify:milestone` |

---

## 2. Why these choices (short)

### Bun + Node 26 + moonrepo

- **Bun**: fast installs/scripts; workspaces.
- **Node 26**: current stable; required because VS Code/Cursor extension host is Node/Electron — Core must run there.
- **moonrepo**: pins Node/Bun versions; reproducible CI/local; better than “hope nvm is set.”

### Oxc parser (v1)

- High-throughput syntax AST for index.
- Same family as Oxlint/Oxfmt.
- Enough for symbols / imports / exports v1.
- **Not** a full typechecker — semantic gaps may later justify optional deep-TS path.

### ngraph

- Leaner memory/perf at repo-scale graphs vs heavier graph libs.
- Accept more DIY for algorithms/layout.

### better-sqlite3

- Sync, fast, works in Node extension host.
- Bun’s sqlite is not the Core persistence choice (host compatibility).

### React Flow

- Fast path to interactive Repository Map.
- Cluster/customize if scale demands (later).

### Oxlint + Oxfmt + Lefthook + Vitest + Vite

- Speed-first DX; consistent with Oxc toolchain.
- Lefthook over Husky for parallel hooks.
- Vite for playground/docs UI bundling.

---

## 3. Constraints (do not violate)

1. **Core must be Node-compatible** — no Bun-only native modules on the analysis path used by extensions.
2. **Surfaces call Core only** — no second analyzer in MCP/CLI/IDE.
3. **No network in Core analysis** — privacy default.
4. **One language vertical first** — TS/JS excellence before Tree-sitter polyglot.
5. **Stack changes need an ADR** — do not silently swap Oxc/ngraph/sqlite/etc.

---

## 4. Rejected / deferred alternatives

| Alternative | Status | Why not (now) |
|---|---|---|
| pnpm + Turborepo | Rejected | Owner locked Bun + moon |
| Biome | Rejected for lint/format | Oxlint + Oxfmt locked |
| graphology | Rejected as primary | ngraph preferred for scale |
| ts-morph as default parser | Deferred | Too slow for full-repo index default |
| Tree-sitter as JS/TS primary | Deferred | Oxc first; Tree-sitter for other langs |
| Bun sqlite for Core | Rejected | Extension host Node |
| Husky | Rejected | Lefthook locked |

---

## 5. Tooling layout (lands in M-001)

| File / area | Role |
|---|---|
| `package.json` + `bun.lock` | Workspaces |
| `.moon/` + `moon.yml` | Tasks + toolchain |
| `.nvmrc` | Node 26.x |
| `.oxlintrc*` / `.oxfmtrc*` | Lint / format |
| `lefthook.yml` | pre-commit |
| `scripts/verify-milestone*` | Quality gate |
| GitHub Actions | CI verify |

Detail: [`../TOOLING_AND_CI.md`](../TOOLING_AND_CI.md).

---

## 6. When to revisit

| Trigger | Action |
|---|---|
| Oxc refs too weak for KG quality | ADR for optional deep-TS mode |
| Map performance ceiling | ADR for canvas/cluster strategy |
| Multi-lang demand | Execute M-034 Tree-sitter plan |
| npm scope `@prism` unavailable | Rename packages (Q-003) |
