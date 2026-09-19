# M-083 — Engine package merge

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-083-engine-merge` |
| Depends on | M-082 Verified |
| Packages | `engine` (folders) + shims from analyzer / indexer / graph-engine / intelligence / impact / navigation / repository-map |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §5 M-083 |

## 1. Goal

Folder moves + re-exports. Public Core method names unchanged. No algorithm rewrite.

## 2. In scope

`packages/engine/{analyzer,indexer,graph-engine,intelligence,impact,navigation,repository-map}`. Point `core` at `engine`. Tests move with folders.

## 3. Out of scope

Jobs inside Core. Indexer inside MCP. Flatten folders into one `src/`. Tool rename.

## 4. Definition of Done

- [ ] All engine tests pass via new paths
- [ ] Old `@repo-prism/*` engine names re-export for one major
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Master Plan §8.1 + §9 + §10. No commits until the owner asks.

## 6. After merge

Open **M-084** from `main`.
