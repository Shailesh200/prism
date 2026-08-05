# Install

**Pick the surface you want.** They share one engine. You can install more than
one; they will agree with each other.

## 0. Requirements (everyone)

1. Install **Node.js 26** or newer (`node -v` should show `v26…`).
2. Have a **project repository** open (TypeScript / JavaScript; git optional but
   recommended).
3. You do **not** need to clone the Prism GitHub repo to use the published CLI,
   MCP server, or extension.

---

## 1. Command line (`prism`)

### Steps

1. Open a terminal **inside your project**:
   ```bash
   cd /path/to/your/project
   ```
2. Check the environment (no `--workspace` needed — Prism uses the git root):
   ```bash
   npx -y @repo-prism/cli doctor
   ```
3. Read the doctor output:
   - **Workspace** — which folder was chosen and why (`git root` is normal).
   - **Index cache** — `warn` on first run is expected; the next command builds
     the index, or you can run `prism index` now.
4. Run your first analyses:
   ```bash
   npx -y @repo-prism/cli dna
   npx -y @repo-prism/cli health
   npx -y @repo-prism/cli blast src/index.ts --fail-on high
   ```
5. (Optional) Install globally so you can type `prism` anywhere:
   ```bash
   npm install -g @repo-prism/cli
   prism doctor
   prism health --verbose
   ```

`--verbose` prints which workspace was chosen and how long indexing took.

Full guide: [Using the CLI](../using/cli.md).

---

## 2. MCP server (Cursor / Claude / Codex / …)

**Goal:** add Prism once; then ask the agent in plain language. You never type
tool names like `repository_health`.

### Quick path — Claude Code

1. `cd` into your project.
2. Run:
   ```bash
   claude mcp add prism -- npx -y @repo-prism/mcp-server
   ```
3. Restart Claude Code if it was already open.
4. Ask: “What is this repository?” or “How healthy is this codebase?”

### Quick path — Cursor

1. Open the project in Cursor.
2. Create `.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "prism": {
         "command": "npx",
         "args": ["-y", "@repo-prism/mcp-server"]
       }
     }
   }
   ```
3. **Settings → MCP** → enable **prism** → wait for ~28 tools.
4. In chat, ask normally (no tool names).

Step-by-step for every client: [Using MCP](../using/mcp.md).

---

## 3. IDE extension (RepoPrism)

### VS Code

1. Open Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`).
2. Search **RepoPrism** (`prismhq.repo-prism`), or install from the
   [Marketplace](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism).
3. Open your project folder (**File → Open Folder…**).
4. Command Palette → **Prism: Open Prism**.
5. Wait for indexing (status bar), then use the map / health UI.

### Cursor

1. Install **RepoPrism** from
   [Open VSX](https://open-vsx.org/extension/prismhq/repo-prism), or search
   Extensions. If search lags, **Extensions: Install from VSIX…**.
2. Open your project folder.
3. Command Palette → **Prism: Open Prism**.
4. (Recommended) Also add the MCP server — [Cursor guide](../using/cursor.md) —
   so the agent and the UI share the same analysis.

---

## 4. From source (contributors only)

1. Clone and enter the repo:
   ```bash
   git clone https://github.com/Shailesh200/prism
   cd prism
   ```
2. Use Node 26 (`nvm use` if you use nvm).
3. Install and verify:
   ```bash
   bun install
   bun run verify:milestone
   ```
4. A green verify means your contributor environment is correct. See
   [CONTRIBUTING](https://github.com/Shailesh200/prism/blob/main/CONTRIBUTING.md).

---

## What Prism writes in your project

After the first analysis you will see:

```
your-repo/
  .prism/
    cache/           index + health history
    consent.json     optional network feature decisions
    bookmarks.json   map bookmarks
    ingest/          artifacts you asked Prism to read
    tools/           tools you consented to install
```

Let Prism add `.prism/` to `.gitignore` when offered — it is derived output, not
source.

---

## Next

1. [Quickstart](./quickstart.md) — first analysis walkthrough  
2. [Using MCP](../using/mcp.md) — agent setup step by step  
3. [Using the CLI](../using/cli.md) — flags, exit codes, CI gates
