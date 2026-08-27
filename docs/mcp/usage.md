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
| "Start my day" | `start_my_day` |
| "Start working on …" | `start_job` |
| "Connect Slack" | `integrations` |

Optional [prompts](/docs/mcp/prompts) (`orient`, `before_edit`, `review_diff`,
`start_my_day`, `start_work`, `where_are_we`, `connect`, `configure`) appear in
clients that show a prompt picker.

## How the server behaves

1. Handshake is fast — connect does not index.
2. First **Intelligence** tool call may take seconds while the index builds.
   `start_my_day` does not wait on the index.
3. stdio only — diagnostics on stderr / logging notifications.
4. Lists are bounded (`totalCount` / `truncated`).
5. Paths outside the workspace are refused.
6. Intelligence tools are read-only. Dispatch tools write gitignored state and
   may open a browser for OAuth. See [Dispatch](/docs/mcp/dispatch) and
   [consent](/docs/concepts/consent-and-privacy).

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
2. Check workspace (`WORKSPACE_FOLDER_PATHS` / git root vs cwd). If Dispatch
   says it cannot see a git repository, reload prism after opening the project
   folder, or set `PRISM_WORKSPACE`.
3. Confirm Node 26+.
4. Disable/re-enable **prism** in the client, or restart.
5. Set `PRISM_WORKSPACE` once and retry.

## Related

[Dispatch](/docs/mcp/dispatch) · [Tools](/docs/mcp/tools) ·
[Install](/docs/mcp/install)
