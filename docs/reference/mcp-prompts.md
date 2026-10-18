---
title: MCP prompts
description: "Optional workflow shortcuts for clients with a prompt picker."
---

Most users never open these. Server instructions make agents call tools from
ordinary chat. Prompts exist for clients that surface a prompt picker (Claude
Desktop, some Cursor builds).

| Prompt | What it does |
|---|---|
| `orient` | `repository_overview` — what this repo is and where to start |
| `before_edit` | `prepare_change` and `blast_radius` for a path you are about to change |
| `review_diff` | `guard_session` and `blast_radius` for the working tree or a base ref |

Every prompt calls only default tools, so none needs an `extraTools` entry.

You do not need prompts if you already ask in plain language — see
[Usage](/docs/usage).

## Related

[Tool reference](/docs/reference/mcp-tools) · [Install](/docs/start/install)
