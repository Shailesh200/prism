# @repo-prism/core

[![npm](https://img.shields.io/npm/v/@repo-prism/core.svg)](https://www.npmjs.com/package/@repo-prism/core)

Public SDK for Prism’s local-first analysis engine. Surfaces (CLI, MCP, IDE)
should call **Core only** — they must not re-implement analysis.

```bash
npm install @repo-prism/core
```

```ts
import { Prism } from "@repo-prism/core";

const client = Prism.create();
const workspace = await client.openRepository("/absolute/path/to/repo");
const health = workspace.getHealth();
```

Most users should use a surface instead of Core directly:

| Surface | Package / link |
|---|---|
| CLI | [`@repo-prism/cli`](https://www.npmjs.com/package/@repo-prism/cli) |
| MCP (agents) | [`@repo-prism/mcp-server`](https://www.npmjs.com/package/@repo-prism/mcp-server) |
| VS Code / Cursor | [Prism](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) |

Docs: [Core SDK](https://github.com/Shailesh200/prism/blob/main/docs/architecture/core-sdk.md) · [Source](https://github.com/Shailesh200/prism)

License: [MIT](https://github.com/Shailesh200/prism/blob/main/LICENSE)
