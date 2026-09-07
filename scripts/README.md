# Scripts

| Script | Purpose |
|---|---|
| `verify-milestone.sh` | Runs `bun run verify:milestone` |
| `check-publish-exports.mjs` | Named `@repo-prism/*` imports in dist must exist on the dependency; `--against-npm` refuses publishing a consumer against a skipped npm dependency that lacks those names |
| `check-mcp-start.mjs` | Loads compiled `dispatch-hub` + `mcp-server` and completes an MCP `initialize` over stdio |
| `publish-npm.mjs` | Publishes the public npm surface bottom-up |
| `check-plan-progress.mjs` | Validates `plans/PROGRESS.md` Hard Rules |
| `bench/run.mjs` | Index/operation wall-time benchmarks (M-035) |
| `bench/agent-orientation.ts` | Agent orientation savings with/without Prism (M-063) |

See [`../plans/VERIFICATION.md`](../plans/VERIFICATION.md).
