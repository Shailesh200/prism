---
title: Using Prism with an AI agent
description: "Plain-language questions map to Prism tools automatically."
---

You set Prism up once. After that, ask what you want — the server's instructions
teach the agent which tools to call.

## How to talk (no tool names)

| You say | Agent should use |
|---|---|
| "What is this repo?" / "Orient me" | `repository_dna`, landmarks / overview |
| "Is this codebase healthy?" | `repository_health` |
| "Where does checkout live?" | landmarks / features / `find_symbol` |
| "I'm about to edit `src/…` — what breaks?" | `blast_radius`, `test_impact` |
| "Can I delete this file?" | `safe_delete` |
| "Review my current changes" | `review_changes` |

Optional [prompts](/docs/mcp/prompts) (`orient`, `before_edit`, `review_diff`)
appear in clients that show a prompt picker.

## How the server behaves

1. Handshake is fast — connect does not index.
2. First tool call may take seconds while the index builds; later calls reuse it.
3. stdio only — diagnostics on stderr / logging notifications.
4. Lists are bounded (`totalCount` / `truncated`).
5. Paths outside the workspace are refused.
6. Every tool is read-only — no consent APIs for agents. See
   [consent and privacy](/docs/concepts/consent-and-privacy).

## Force a specific repo path

Only if auto-detection is wrong:

```bash
npx -y @repo-prism/mcp-server --workspace /path/to/repo
# or
PRISM_WORKSPACE=/path/to/repo npx -y @repo-prism/mcp-server
```

Put the same into the client's `args` / `env` if needed.

## If something fails

1. `npx -y @repo-prism/cli doctor` inside the same project.
2. Check workspace (`git root` vs cwd).
3. Confirm Node 26+.
4. Disable/re-enable **prism** in the client, or restart.
5. Set `PRISM_WORKSPACE` once and retry.

## Related

[Tools](/docs/mcp/tools) · [Install](/docs/mcp/install) ·
[Before you edit](/docs/guides/before-you-edit)
