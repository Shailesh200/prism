---
title: Install the IDE extension
description: "Install Prism in VS Code or Cursor and open your project folder."
---

Install **Prism** (extension id `prismhq.repo-prism`), open a project folder,
then Command Palette → **Prism: Open Prism**.

## VS Code

1. Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`).
2. Search **Prism**, or install from the
   [Marketplace](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism).
3. **File → Open Folder…** (not a single file).
4. Command Palette → **Prism: Open Prism**.
5. Wait for indexing (status bar), then use map / health UI.

## Cursor

1. Install **Prism** from
   [Open VSX](https://open-vsx.org/extension/prismhq/repo-prism), or search
   Extensions. If search lags: **Extensions: Install from VSIX…**.
2. Open your project folder.
3. Command Palette → **Prism: Open Prism**.
4. (Recommended) Also add the [MCP server](/docs/mcp/install) so the agent and
   UI share the same analysis.

## Requirements

Node.js 26+ for CLI/MCP companions. The extension indexes the open workspace.

## Next

[Usage](/docs/ide/usage) · [Settings](/docs/ide/settings) · [MCP install](/docs/mcp/install)
