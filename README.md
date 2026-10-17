<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/readme-hero-dark-1280x320.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/readme-hero-light-1280x320.png">
    <img alt="Prism: know before you ship." src="./assets/readme-hero-light-1280x320.png" width="100%">
  </picture>
</p>

# Prism

[![Website](https://img.shields.io/badge/website-prismhq.in-00c2c2)](https://www.prismhq.in)
[![npm @repo-prism/cli](https://img.shields.io/npm/v/@repo-prism/cli.svg?label=@repo-prism/cli)](https://www.npmjs.com/package/@repo-prism/cli)
[![License: MIT](https://img.shields.io/github/license/Shailesh200/prism)](./LICENSE)

**Know before you ship.**

When Claude Code stops, Prism runs your checks on what changed and gives one
verdict: SHIP, NOT PROVEN or NO-SHIP. It also works with Cursor, Codex and
opencode. Free, MIT, and it runs on your machine: no account, and your code
never leaves it.

**Website:** [prismhq.in](https://www.prismhq.in) · **Docs:** [prismhq.in/docs](https://www.prismhq.in/docs)

---

## Get started

```bash
npm install -g @repo-prism/cli && prism start
```

Run it inside your repository. `prism start` finds the agents on your machine
(Claude Code, Cursor, Codex, opencode), installs Prism for each, indexes the
repository and prints its map. To pick agents yourself, run
`prism install claude` (or `cursor`, `codex`, `opencode`, `all`).
`prism install` records what it wrote in `~/.prism/install.json`, and
`prism uninstall` removes exactly that. `prism upgrade` updates Prism.

Wiring another MCP host by hand? Use this server entry:

```json
{ "mcpServers": { "prism": { "command": "npx", "args": ["-y", "@repo-prism/mcp-server@2"] } } }
```

Then ask your agent in plain language, for example "what breaks if I change
`src/index.ts`?" or "review my changes". You never type tool names.

## What it does

- **Prepare, before the agent edits.** The files and tests that matter for
  the task, the helpers to reuse instead of rewriting, and your house style.
- **Review, after.** Prism ranks the changes by risk and lists the tests that
  reach them.
- **The receipt, when the agent stops.** Prism runs the checks the change
  reaches and gives one verdict: `SHIP`, `NOT PROVEN` (with the cheapest check
  to prove it) or `NO-SHIP`.

Nine default MCP tools; more are opt-in through `extraTools` in
`~/.prism/config.json`. Full list: [MCP tools](https://www.prismhq.in/docs/reference/mcp-tools).

| You say | The agent calls |
|---|---|
| "What is this repo?" | `repository_overview` |
| "I want to change X" | `prepare_change` |
| "What breaks if I edit this file?" | `blast_radius`, `test_impact` |
| "Where is this symbol, who uses it?" | `graph` |
| "Review my changes" | `guard_session` (`review: true`) |
| "Start my day" (a saved routine) | `habits` |
| "Did I break anything?" | the stop receipt, run by the hook |

## CLI

Every command answers from the same local index. Highlights:

| Command | What it answers |
|---|---|
| `prism prepare <task>` | The files to open and the helpers to reuse |
| `prism review [paths] --lens qa` | A lens review of a change |
| `prism blast <target>` | What depends on a file or symbol |
| `prism test-impact <target>` | Which tests reach a file |
| `prism receipts` | The last stop receipts |
| `prism lens`, `prism habit` | Your review lenses and saved routines |
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
nvm use          # the version in .nvmrc
bun install
bun run build
bun run verify:milestone
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and the [changelog](./CHANGELOG.md).

## License

[MIT](./LICENSE)
