# Using Prism with an AI agent

**You set Prism up once. After that, talk to the agent in plain language — you
never type tool names like `repository_health`.**

The MCP server tells the agent when to call which Prism tool. You ask “is this
repo healthy?” or “what breaks if I change auth?”; the agent calls the tools.

Tool reference (for debugging only): [MCP tool reference](../reference/mcp-tools.md).

---

## Before you start

1. Install **Node.js 26** or newer.
2. Open (or `cd` into) the **project repository** you want analysed.
3. You do **not** need to clone the Prism repo and you do **not** paste a
   `--workspace` path in the happy path.

Workspace resolution (automatic):

`--workspace` → `PRISM_WORKSPACE` → nearest **git root** from the process cwd → cwd.

---

## Setup — pick your client

Follow **one** of the sections below end to end.

### A. Claude Code (fastest)

1. Open a terminal **inside your project**:
   ```bash
   cd /path/to/your/project
   ```
2. Add Prism with one command:
   ```bash
   claude mcp add prism -- npx -y @repo-prism/mcp-server
   ```
3. Start (or restart) Claude Code in that project.
4. Confirm Prism is connected (Claude’s MCP / tools list should show **prism**
   with tools available).
5. Ask in plain language — for example:
   - “What is this repository?”
   - “How healthy is this codebase?”
   - “What breaks if I change `src/auth/session.ts`?”

You should see the agent call Prism tools on its own. You do **not** need to
say “call `repository_dna`”.

### B. Cursor

1. Open your project folder in Cursor.
2. Create `.cursor/mcp.json` at the project root (or edit `~/.cursor/mcp.json`
   for every project):
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
3. Save the file.
4. Open **Cursor Settings → MCP**.
5. Find **prism** and turn it **on**. Wait until tools show (about 28).
6. If tools do not appear: reload the window, or restart Cursor, then check MCP
   again.
7. In Agent/Chat, ask normally — for example “is this repo healthy?” or “check
   blast radius before I edit `src/index.ts`”.

No `--workspace`. Cursor starts the server from the open project; Prism walks
up to the git root.

### C. Claude Desktop

1. Open Claude Desktop’s config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add (or merge) this block:
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
3. Save the file.
4. Fully quit and reopen Claude Desktop.
5. Open or start from the **project folder** you care about (so the server’s
   cwd is that project). If your client always starts MCP from a fixed
   directory, add once:
   ```json
   "env": { "PRISM_WORKSPACE": "/absolute/path/to/your/project" }
   ```
   inside the `prism` server entry.
6. Confirm Prism tools appear in Claude’s MCP UI.
7. Ask in plain language as above.

### D. Codex CLI

1. Edit `~/.codex/config.toml`.
2. Add:
   ```toml
   [mcp_servers.prism]
   command = "npx"
   args = ["-y", "@repo-prism/mcp-server"]
   ```
3. Save the file.
4. Run Codex from inside your project directory.
5. Ask in plain language; the agent should call Prism tools when the question
   is structural.

---

## How to talk to the agent (no tool names)

Do **not** type `call repository_health`. Say what you want:

| You say | Agent should use (automatically) |
|---|---|
| “What is this repo?” / “Orient me” | `repository_dna`, landmarks / overview |
| “Is this codebase healthy?” | `repository_health` |
| “Where does checkout live?” | landmarks / features / `find_symbol` |
| “I’m about to edit `src/…` — what breaks?” | `blast_radius`, `test_impact` |
| “Can I delete this file?” | `safe_delete` |
| “Review my current changes” | `review_changes` |

The server’s **instructions** teach the agent these mappings on connect. Optional
MCP **prompts** (`orient`, `before_edit`, `review_diff`) appear in clients that
show a prompt picker — useful shortcuts, not required.

---

## Optional: force a specific repo path

Only if auto-detection picks the wrong folder:

```bash
npx -y @repo-prism/mcp-server --workspace /path/to/repo
# or
PRISM_WORKSPACE=/path/to/repo npx -y @repo-prism/mcp-server
```

Put the same flag/env into your client’s `args` / `env` if needed.

**Do not** run `prism-mcp` in a bare terminal and leave it on `ready on stdio` —
that means it is waiting for an MCP client. Configure the client; the client
starts the process.

---

## How the server behaves

1. **Handshake is fast** — connect does not index.
2. **First tool call** may take several seconds while the index builds. The
   server emits MCP logging (`Indexing… analyze (12/400)`) and stderr lines so
   the client does not look hung; later calls reuse the index.
3. **stdio only** — diagnostics go to stderr / logging notifications, never
   protocol stdout.
4. **Lists are bounded** — responses include `totalCount` / `truncated`.
5. **Paths outside the workspace are refused.**
6. **Every tool is read-only** — no network, no consent APIs for agents. See
   [consent and privacy](../concepts/consent-and-privacy.md).

---

## If something fails

1. Run `npx -y @repo-prism/cli doctor` **inside the same project**.
2. Check which workspace it chose (`git root` vs cwd).
3. Confirm Node is 26+.
4. In the MCP client, disable and re-enable **prism**, or restart the client.
5. If the index still fails, set `PRISM_WORKSPACE` to the repo root once and
   retry.

---

## Related

[MCP tool reference](../reference/mcp-tools.md) · [Install](../getting-started/install.md) · [Cursor](./cursor.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
