<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/readme-hero-dark-1280x320.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/readme-hero-light-1280x320.png">
    <img alt="Prism: your agent’s second pair of eyes. Know before you ship." src="./assets/readme-hero-light-1280x320.png" width="100%">
  </picture>
</p>

# Prism

[![Website](https://img.shields.io/badge/website-prismhq.in-00c2c2)](https://www.prismhq.in)
[![npm @prismapp/cli](https://img.shields.io/npm/v/@prismapp/cli.svg?label=@prismapp/cli)](https://www.npmjs.com/package/@prismapp/cli)
[![License: MIT](https://img.shields.io/github/license/Shailesh200/prism)](./LICENSE)

**Your agent's second pair of eyes.** Know before you ship.

Local software intelligence that catches what the agent missed. Prism gives
your coding agent the right files before it edits, then flags the code it
skipped and the code no test covers. Free, MIT, and it runs on your machine:
no account, and your code never leaves it.

**Website:** [prismhq.in](https://www.prismhq.in) · **Docs:** [prismhq.in/docs](https://www.prismhq.in/docs) · **Contact:** [hello@shaileshjha.in](mailto:hello@shaileshjha.in)

---

## Get started

```bash
npm install -g @prismapp/cli && prism install all
```

Run the second command inside your repository. `prism install all` connects
every agent it finds. Quit the agent and open it again. The first use builds
the index under `~/.prism/`. One agent only: pass its name to `prism install`.
The install records what it wrote in `~/.prism/install.json`, and
`prism uninstall` removes exactly that. A new version is
`npm install -g @prismapp/cli` then `prism upgrade`. Memories, receipts, and
habits stay.

Wiring another MCP host by hand? Use this server entry:

```json
{ "mcpServers": { "prism": { "command": "npx", "args": ["-y", "@prismapp/mcp-server"], "env": { "PRISM_EXTRA_TOOLS": "receipt" } } } }
```

Then ask your agent in plain language, for example "what breaks if I change
`src/index.ts`?" or "review my changes". You never type tool names.

## What it does

- **Prepare, before the agent edits.** The files and tests that matter for
  the task, and the helpers to reuse instead of rewriting.
- **Match the code, during the edit.** Prism points at a file from your repo
  to copy, so the new code looks like the rest.
- **Lens review, after.** Dev, Architect and QA lenses flag the callers the
  change left behind and the code no test covers. Add your own with `prism lens`.
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
