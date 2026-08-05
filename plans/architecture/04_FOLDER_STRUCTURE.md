# Prism — Folder Structure

| Field | Value |
|---|---|
| Status | Draft (M-000) — scaffold in **M-001** |
| Expands | [`../STRUCTURE.md`](../STRUCTURE.md) |

This is the **canonical layout** implementers should create and keep. Package READMEs already stub ownership.

---

## 1. Repository tree

```text
Prism/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── LICENSE                      # M-001 (default MIT)
├── package.json                 # Bun workspaces root
├── bun.lock
├── bunfig.toml                  # optional
├── .nvmrc                       # 26
├── .gitignore
├── lefthook.yml
├── .oxlintrc.json               # or oxlintrc equivalent
├── .oxfmtrc.json
├── tsconfig.base.json
├── moon.yml
├── .moon/
│   └── ...
├── .github/
│   └── workflows/
│       └── verify.yml           # M-001 or shortly after
├── apps/
│   ├── playground/              # Vite Map + Core demos
│   └── docs/                    # Docs site (content grows; site gen M-038)
├── packages/
│   ├── shared/
│   ├── analyzer/
│   ├── indexer/
│   ├── graph-engine/
│   ├── intelligence/
│   ├── impact/
│   ├── navigation/
│   ├── repository-map/
│   ├── core/
│   ├── ui/
│   ├── mcp-server/
│   ├── cli/
│   ├── vscode-extension/
│   └── cursor-extension/
├── plans/
│   ├── 00_MASTER_DEVELOPMENT_PLAN.md
│   ├── PROGRESS.md
│   ├── START_HERE.md
│   ├── architecture/            # THIS pack (M-000)
│   ├── milestones/
│   ├── adr/
│   ├── mockups/                 # Locked brand PNGs
│   └── ...
├── scripts/
│   ├── verify-milestone.*
│   └── check-plan-progress.*
├── fixtures/                    # Sample repos for tests (from M-006+)
└── .prism/                      # Local cache at runtime (gitignored) — not in repo
```

---

## 2. Directory ownership

| Path | Owns | Must not |
|---|---|---|
| `packages/shared` | Contracts only | Business analysis logic |
| `packages/core` | Public SDK façade | Duplicate engine logic |
| `packages/*-engine` / domain | Domain algorithms | UI, MCP protocol |
| `packages/ui` | React Map widgets | Calling analyzer directly |
| `packages/mcp-server` | MCP wiring | Reimplement graphs |
| `packages/cli` | CLI wiring | Reimplement graphs |
| `packages/*-extension` | IDE wiring + webview | Core reimplementation |
| `apps/playground` | Demos | Production extension code |
| `plans/` | Product/engineering SoT | Runtime code |
| `plans/mockups/logo/` | Locked brand assets | Ad-hoc redesign without approval |
| `scripts/` | Verify / automation | Product features |
| `fixtures/` | Test corpora | Secrets |

---

## 3. Package naming

- npm name: `@repo-prism/<folder-name>`
- Import rule: surfaces → `@repo-prism/core` (+ `@repo-prism/shared` types, `@repo-prism/ui` for IDE/playground)

---

## 4. Brand assets (locked)

| Asset | Path |
|---|---|
| Mark master | `plans/mockups/logo/prism-mark.png` |
| Lockup light | `plans/mockups/logo/prism-lockup.png` |
| Lockup dark | `plans/mockups/logo/prism-lockup-dark.png` |
| Sized exports | `plans/mockups/logo/exports/` |
| Gallery | `plans/mockups/gallery.html` |

Copy into extension/app icon paths during IDE milestones — do not invent new marks.

---

## 5. Branch / milestone convention

```text
milestone/M-XXX-short-name
```

Examples:

- `milestone/M-000-architecture-docs`
- `milestone/M-001-project-foundation`

Never develop on `main`. Never stack milestone branches.

---

## 6. M-001 scaffold checklist

- [ ] Root Bun workspace + moon toolchain (Node 26)
- [ ] Oxlint / Oxfmt / Lefthook / Vitest wired
- [ ] `packages/*` stubs with `package.json` + `tsconfig` + README
- [ ] `apps/playground` + `apps/docs` placeholders
- [ ] `scripts/verify-milestone` green
- [ ] `.prism/` in `.gitignore`
