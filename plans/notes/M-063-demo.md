# M-063 — Killer demo script

Side-by-side proof asset: **agent edits a fixture repo with and without Prism**.
Record as a GIF for README / website, or run live from this script.

## Setup (both sides)

```bash
cd packages/intelligence/fixtures/m012-features
# Terminal A — baseline agent (no MCP)
# Terminal B — Cursor/Claude with Prism MCP enabled
```

Enable Prism only on side B:

```bash
# Claude Code (side B)
claude mcp add prism -- npx -y @repo-prism/mcp-server

# Cursor (side B): use "Add to Cursor" on https://www.prismhq.in/benchmarks
# or paste packages/mcp-server/mcp-install.json into .cursor/mcp.json
```

## Act 1 — Orientation (60 s)

**Prompt (both agents):**

> What is this repository? What are the main domains and where should I start reading?

| Without Prism | With Prism |
|---|---|
| Agent lists dirs, reads `package.json`, skims `packages/auth`, `packages/billing`, `src/routes/checkout` | Agent calls `repository_dna` + `repository_overview` (or you ask in plain language) |
| 8–15 tool calls, scattered file reads | 2–3 tool calls, ranked domains + landmarks |
| Answer mixes guesses from folder names | Answer cites detected features: auth, billing, checkout, dashboard |

**Narration line:** “Structure first — not a file walk.”

## Act 2 — Safe edit (90 s)

**Prompt (both agents):**

> I need to refactor `packages/auth/src/index.ts`. What breaks if I change it? Is this edit safe?

| Without Prism | With Prism |
|---|---|
| Reads target file, greps for `auth`, opens random importers | Calls `blast_radius` on the file |
| May miss transitive dependents | Shows dependents with confidence + test impact hint |
| “Looks safe” or incomplete list | Ranked impact list with paths |

**Narration line:** “Blast radius before the diff — not after CI fails.”

## Act 3 — The wedge (30 s)

Split screen recap:

```
WITHOUT                          WITH PRISM
─────────────────────────────────────────────────
14 reads · ~4k tokens            3 calls · structured DNA
32 scans · ~18k tokens           1 blast_radius · ranked deps
```

Point to [benchmarks](https://www.prismhq.in/benchmarks) for numbers.

## Recording tips

1. **Resolution:** 1280×720, dark IDE theme matching prismhq.in
2. **Side B only** needs MCP green dot / tool call chips visible
3. **Hide** file paths outside the fixture
4. Export GIF ≤ 8 MB for GitHub README (`ffmpeg -i demo.mp4 -vf fps=10,scale=960:-1 demo.gif`)

## Where to publish

| Surface | Placement |
|---|---|
| README | `## Demo` section below Get started — embed GIF or link to `/benchmarks` |
| Website | `/benchmarks` hero or `/features` — optional `public/demo.gif` |
| Social | Same GIF + “structural intelligence before an edit” caption |

## Optional live variant

Run `bun run bench:orientation` on stage left terminal while agents work on
stage right — ties the scripted demo to reproducible numbers.
