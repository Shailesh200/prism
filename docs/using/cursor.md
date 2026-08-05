# Using Prism in Cursor

**Two pieces:** the visual **RepoPrism** extension, and the **MCP server** so
Cursor’s agent uses the same analysis. Do both for the full experience.

---

## Part 1 — Extension (map & dashboards)

1. Open Cursor.
2. Open **Extensions** and install **RepoPrism**
   ([Open VSX](https://open-vsx.org/extension/prismhq/repo-prism), or search
   `RepoPrism`). If search lags: download the `.vsix` → Command Palette →
   **Extensions: Install from VSIX…**.
3. **File → Open Folder…** and choose your project (not a single file).
4. Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) → **Prism: Open Prism**.
5. Wait until the status bar shows Prism is ready (indexing may take a moment
   on first open).
6. Use the UI: Overview, Map, Blast Radius, Health, etc.

Same UI as VS Code — see [Using the VS Code extension](./vscode-extension.md).

---

## Part 2 — MCP (agent tools)

1. Keep the **same project folder** open in Cursor.
2. Create `.cursor/mcp.json` at the project root:
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
   (Or put the same block in `~/.cursor/mcp.json` to use Prism in every project.)
3. Save the file.
4. Open **Cursor Settings → MCP**.
5. Enable **prism**. Wait until ~**28 tools** appear.
6. If nothing appears: reload the window or restart Cursor, then check MCP again.

**No `--workspace` path.** Cursor starts the server from the open project;
Prism walks up to the git root.

---

## Part 3 — Talk to the agent (plain language)

You do **not** type tool names. Ask what you want:

1. “What is this repository?”
2. “How healthy is this codebase?”
3. “I’m about to change `src/auth/session.ts` — what depends on it and which
   tests cover it?”
4. “Can I safely delete `src/legacy/adapter.ts`?”

The MCP server instructs the agent to call the right Prism tools automatically.

Optional: clients that show MCP prompts can use `orient`, `before_edit`, or
`review_diff` as shortcuts.

---

## Using extension + agent together

1. Open the map in the extension when you want a visual overview.
2. In chat, ask structural questions or request changes; the agent should call
   Prism before risky edits.
3. If the agent guesses instead of calling tools, say once: “Use Prism for
   that” — after setup it should not need tool names.

Full MCP detail: [Using Prism with an AI agent](./mcp.md).

---

## Related

[MCP](./mcp.md) · [Install](../getting-started/install.md) · [VS Code extension](./vscode-extension.md) · [MCP tool reference](../reference/mcp-tools.md)
