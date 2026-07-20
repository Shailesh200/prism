# Recommended Repository & Package Structure

## C. Repository structure

```text
Prism/
├── apps/
│   ├── playground/              # Map + Core interactive demos
│   └── docs/                    # Docs site (VitePress/Astro — M-038)
├── packages/
│   ├── shared/
│   ├── core/
│   ├── analyzer/
│   ├── indexer/
│   ├── graph-engine/
│   ├── intelligence/
│   ├── impact/
│   ├── navigation/
│   ├── repository-map/
│   ├── mcp-server/
│   ├── cli/
│   ├── ui/
│   ├── vscode-extension/
│   └── cursor-extension/
├── plans/
│   ├── 00_MASTER_DEVELOPMENT_PLAN.md
│   ├── PROGRESS.md
│   ├── START_HERE.md
│   ├── OPEN_QUESTIONS.md
│   ├── VERIFICATION.md
│   ├── STRUCTURE.md
│   ├── architecture/          # M-000: HLD, LLD, tech stack, folder structure, data flows
│   ├── milestones/
│   ├── mockups/               # Locked brand PNGs (see mockups/LOCKED.md)
│   └── adr/
├── scripts/                     # verify helpers (M-001)
├── fixtures/                    # shared sample repos (from M-006+)
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── package.json                 # Bun workspaces
├── bun.lock
├── bunfig.toml                  # optional
├── .moon/                       # moonrepo workspace config
├── moon.yml                     # or per-project moon.yml files
├── lefthook.yml
├── tsconfig.base.json
├── .oxlintrc.json               # or oxlint config of choice
├── .oxfmtrc.json                # or oxfmt config of choice
└── .nvmrc                       # Node 26.x
```

## D. Package structure (typical package)

```text
packages/<name>/
├── package.json                 # name: @prism/<name>
├── tsconfig.json
├── README.md                    # responsibility + public API
├── src/
│   ├── index.ts                 # public exports only
│   └── ...
└── tests/
    ├── unit/
    └── integration/
```

### Dependency direction (allowed)

```text
shared ← analyzer ← indexer
shared ← graph-engine
graph-engine + indexer + analyzer ← intelligence / impact / navigation / repository-map
all engines ← core
core ← mcp-server / cli / vscode-extension / ui / playground
```

**Forbidden:** surfaces importing `analyzer` / `indexer` internals directly.

### Package README minimum sections

1. Purpose  
2. Public API  
3. Non-goals  
4. Related milestones  
5. Verification commands  

Stub READMEs under `packages/*/README.md` describe intent only until M-001 scaffolds `package.json` files.
