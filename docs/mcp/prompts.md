---
title: MCP prompts
description: "Optional orient, before_edit, and review_diff shortcuts for clients with a prompt picker."
---

Most users never open these. Server instructions make agents call tools from
ordinary chat. Prompts exist for clients that surface a prompt picker (Claude
Desktop, some Cursor builds).

| Prompt | What it does |
|---|---|
| `orient` | DNA, health, landmarks / overview — "what is this repo?" |
| `before_edit` | `blast_radius` + `test_impact` for a path you are about to change |
| `review_diff` | `review_changes` for the working tree or a base ref |

You do not need prompts if you already ask in plain language — see
[Usage](/docs/mcp/usage).

## Related

[Tool reference](/docs/reference/mcp-tools) · [Install](/docs/mcp/install)
