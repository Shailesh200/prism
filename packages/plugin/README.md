# Prism plugin pack

Skills and slash commands that teach a coding agent **how Prism's tools
compose** — and how to combine them with the connectors your editor already
has.

Prism ships tools. Each one works on its own. Nothing in a tool list says that
reviewing a pull request means impact analysis before opinion, or that editing
unfamiliar code means checking what depends on it first. That is what these
skills say.

## What is in it

| Skill | For |
|---|---|
| `prism-review-pr` | Review a change with its blast radius, then post it with your GitHub and issue-tracker tools |
| `prism-safe-change` | Check what depends on code before editing, renaming or deleting it |
| `prism-verify-regression` | Pick the tests that actually cover a change, then run them with your own tools |
| `prism-ship` | Raise a PR whose description is grounded in real impact |
| `prism-onboard` | Get oriented in an unfamiliar repository |

Commands: `/prism-review`, `/prism-check`, `/prism-onboard`.

## Connectors

Prism holds **no third-party credentials** and makes no network calls
(ADR-0049). Where a skill needs GitHub, Linear, Jira, Slack or Playwright, it
uses the connector configured in your editor, under the grant you already gave
it there. Skills name capabilities by role — "your GitHub tools" — never by tool
name, because Prism cannot know whether GitHub reaches you as a plugin, an MCP
server, or the `gh` CLI.

Two skills need no connector at all: `prism-safe-change` and `prism-onboard`.

## Build

```bash
bun run build
```

Emits `dist/pack/`, installable by both Cursor and Claude Code:

```text
dist/pack/
  .cursor-plugin/plugin.json
  .claude-plugin/plugin.json
  mcp.json
  skills/<id>/SKILL.md
  commands/<id>.md
```

Both manifests are generated from `src/definition.ts`. The build fails if the
definition and the directories disagree, because a pack missing a skill still
installs — you find out when the skill never fires.

The pack version tracks `@repo-prism/mcp-server`: installing the pack is
installing a way to talk to that server.
