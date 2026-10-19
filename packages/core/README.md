# @repo-prism/core

Public SDK for Prism’s local-first analysis engine. Surfaces (CLI, MCP, IDE)
should call **Core only** — they must not re-implement analysis. Core ships
inside [`@prismapp/cli`](https://www.npmjs.com/package/@prismapp/cli) and
[`@prismapp/mcp-server`](https://www.npmjs.com/package/@prismapp/mcp-server).
It is not published on its own.

**Website:** [https://www.prismhq.in](https://www.prismhq.in) · **Docs:** [https://www.prismhq.in/docs](https://www.prismhq.in/docs)

```bash
npm install -g @prismapp/cli
```

```ts
import { Prism } from "@repo-prism/core";

const client = Prism.create();
const workspace = await client.openRepository("/absolute/path/to/repo");
const blast = await workspace.blastRadius({ kind: "file", id: "src/index.ts" });
```

Most users should use a surface instead of Core directly:

| Surface | Package / link |
|---|---|
| CLI | [`@prismapp/cli`](https://www.npmjs.com/package/@prismapp/cli) |
| MCP (agents) | [`@prismapp/mcp-server`](https://www.npmjs.com/package/@prismapp/mcp-server) |
| VS Code / Cursor | [Prism](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) |

Architecture notes: [Core SDK (source)](https://github.com/Shailesh200/prism/blob/main/docs/architecture/core-sdk.md) · [Website](https://www.prismhq.in) · [Source](https://github.com/Shailesh200/prism)

License: [MIT](https://github.com/Shailesh200/prism/blob/main/LICENSE)
