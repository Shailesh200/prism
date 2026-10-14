# Prism

[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)
[![Website](https://img.shields.io/badge/website-prismhq.in-00c2c2)](https://www.prismhq.in)
[![npm @repo-prism/cli](https://img.shields.io/npm/v/@repo-prism/cli.svg?label=@repo-prism/cli)](https://www.npmjs.com/package/@repo-prism/cli)
[![License: MIT](https://img.shields.io/github/license/Shailesh200/prism)](./LICENSE)

**Faster agent sessions. Fewer broken builds.**

Prism maps your TypeScript or JavaScript repository on your machine and gives
your coding agent the right files, the code that already exists, and what will
break — before it edits. When the agent stops, Prism runs the checks that
change reaches and prints a receipt saying what is proven. Local-first. No
account. Your code never leaves the machine.

**Website:** [prismhq.in](https://www.prismhq.in) · **Docs:** [prismhq.in/docs](https://www.prismhq.in/docs)

---

## Get started

Needs **Node.js 24+**.

```bash
npm install -g @repo-prism/cli
prism install claude     # or: cursor, codex, opencode, all
prism doctor
```

`prism install` writes the MCP entry, the hooks or the rule line for each agent
host and records exactly what it wrote in `~/.prism/install.json`;
`prism uninstall` removes exactly that. The MCP entry launches the installed
`prism-mcp` binary, never a registry download. `prism upgrade` updates both.

Then ask your agent in plain language — "what breaks if I change
`src/index.ts`?", "review my changes". You never type tool names.

## What the agent gets

Nine default MCP tools. Eleven more are opt-in through `extraTools` in
`~/.prism/config.json`. Full list: [MCP tools](https://www.prismhq.in/docs/reference/mcp-tools).

| You say | The agent calls |
|---|---|
| "What is this repo?" | `repository_overview` |
| "I want to change X" | `prepare_change` |
| "What breaks if I edit this file?" | `blast_radius`, `test_impact` |
| "Where is this symbol, who uses it?" | `graph` |
| "Review my changes" | `review_changes` |
| "Did I break anything?" | the stop receipt, run by the hook |

The hooks keep to a latency budget: they read a snapshot Prism wrote when it
last indexed, and stay silent when that snapshot no longer matches your
checkout.

## CLI

Every command answers from the same local index. Highlights:

| Command | What it answers |
|---|---|
| `prism overview` | Languages, stack, landmarks |
| `prism prepare <task>` | The files to open and the helpers to reuse |
| `prism blast <target>` | What depends on a file or symbol |
| `prism review [paths]` | Blast radius and test impact for a change |
| `prism test-impact <target>` | Which tests reach a file |
| `prism receipts` | The last stop receipts |
| `prism graph export` | `graph.json` for your own tools |
| `prism doctor` | What is wired, and whether it works |

Full list: [CLI reference](https://www.prismhq.in/docs/reference/cli-commands).

## Privacy

Analysis makes **no network requests**; a trap test suite fails the build if
one appears. The only request Prism makes is a once-a-day update check against
the npm registry, which never relaunches anything and is off with
`PRISM_SKIP_SELF_UPDATE=1`. → [`PRIVACY.md`](./PRIVACY.md) · [`SECURITY.md`](./SECURITY.md)

## Build from source

```bash
git clone https://github.com/Shailesh200/prism
cd prism
nvm use          # Node 24.18.1
bun install
bun run build
bun run verify:milestone
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and the [changelog](./CHANGELOG.md).

## License

[MIT](./LICENSE)
