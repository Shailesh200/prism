# ADR-0050: Prism Plugin Pack, and worker access to intelligence

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-03 |
| Decision makers | Owner, Architect |
| Related milestones | [M-067](../milestones/M-067_shippable-product.md) |
| Supersedes | — |
| Amends | [ADR-0041](./0041-dispatch-worker-resource-budget.md), [ADR-0044](./0044-dispatch-worker-backends.md) |
| Extends | [ADR-0048](./0048-prism-console-unification.md), [ADR-0049](./0049-host-delegated-integrations.md) |

## Context

Two gaps were found in the shippable-product audit, and they turn out to be the
same gap seen from two ends.

**MCP does not compose itself.** Prism ships 32 intelligence tools and 9
Dispatch tools. Each one works. But nothing tells an agent that reviewing a pull
request means `repository_dna` for context, then `review_changes`, then
`blast_radius` on whatever that flagged, then `test_impact` to pick the suite —
and *then* the host's own GitHub and Linear connectors to post the review and
move the ticket. The knowledge of which tools compose, in what order, toward
what outcome, lives only in `instructions.ts`: a 15KB blob every client pays for
on every session, written as rules for a router rather than as procedures for a
task. An agent that reads all of it still does not know how to review a PR.

ADR-0049 made this sharper rather than softer. Now that connectors belong to the
agent window, the interesting workflows are exactly the ones that *cross* the
boundary — Prism's structural analysis plus the host's Slack, GitHub, Linear and
Playwright. Nothing in Prism can express a procedure that spans both, because
Prism only ships tools and tools cannot reference tools they do not own.

**Workers cannot see the repository they are editing.** ADR-0041 set
`mcpServers: {}` for Dispatch workers, for a good reason that is worth
restating: a teammate with Prism MCP attached would start its own Core, index
the repository a second time, and exhaust an 8GB laptop. The ban worked. It also
means the teammate editing your code is the one participant in the system with
no access to `blast_radius` — while the host chat, which is not editing
anything, has all 32 tools. The habit Prism most wants to enforce is the one it
withholds from the process that most needs it.

Both were unfixable until now. Skills need somewhere to live, and the plugin
format is only just standard across hosts. Worker intelligence needs a Core that
is already loaded and already indexed, which is exactly what ADR-0048's Console
became.

## Decision

### 1. Ship a plugin pack, generated from one definition

A new `@repo-prism/plugin` package emits a directory that both Cursor and Claude
Code can install: `.cursor-plugin/plugin.json`, `.claude-plugin/plugin.json`,
`skills/<id>/SKILL.md`, `commands/*.md`, and `mcp.json`.

The two manifests disagree in shape — Cursor takes directory strings
(`"skills": "skills"`), Claude takes arrays of file paths
(`"commands": ["./commands/ship.md"]`) — so both are **generated from a single
`PluginDefinition`** rather than hand-maintained. Two hand-written manifests
would drift within a release, and the failure is silent: the pack still
installs, just missing whatever one file was forgotten.

Skill prose stays as real markdown on disk. It is prose; it belongs in a `.md`
file where it can be read and diffed, not in a TypeScript string. The build
copies it and the definition names it, and a test asserts the two agree — every
skill named in the definition exists, every skill on disk is named, and every
`SKILL.md` carries the `name` and `description` frontmatter that hosts require
for discovery.

### 2. Skills are procedures that cross the boundary

Five, each covering a workflow that neither Prism nor the host can complete
alone:

| Skill | Prism supplies | Host supplies |
|---|---|---|
| `prism-review-pr` | `review_changes`, `blast_radius`, `test_impact` | GitHub review, Linear transition |
| `prism-safe-change` | `blast_radius`, `rename_impact`, `safe_delete` | the edit itself |
| `prism-verify-regression` | `test_impact` picks the suite | Playwright drives it |
| `prism-ship` | `review_changes` for the description | PR, reviewers, ticket |
| `prism-onboard` | `repository_dna`, `landmarks` | — |

`prism-safe-change` and `prism-onboard` name no host tool, and that is
deliberate: a pack whose every skill needs a connector is useless to someone who
has none.

A skill names host capabilities by **role** ("your GitHub tools"), never by tool
name. Prism cannot know whether GitHub arrives as a Cursor plugin, an MCP
server, or the `gh` CLI, and a skill that hardcodes one is wrong on the other
two. This is the same discipline as ADR-0049's fill contract: name the need,
let the host bind it.

### 3. Workers reach intelligence through the Console, not through Core

`mcpServers: {}` becomes a worker-role Prism MCP whose intelligence tools are
**proxies to the Console's `/api/host`**. The Console already has Core loaded
against the host workspace, with the index already warm (ADR-0048). A worker
asking for `blast_radius` therefore costs one loopback HTTP round trip and zero
additional memory.

This amends ADR-0041 rather than reversing it. Its rule was never "workers must
be blind"; it was "there must be exactly one Core per machine". That invariant
is now *strengthened*: before this change a worker had no Core, and the only
reason it did not start one was that we withheld the means. Now there is a
supported path that structurally cannot start a second one, because the proxy
has no Core to start.

Three consequences follow, and each is a deliberate limit:

- **The proxy resolves against the host workspace, not the worktree.** The
  Console indexes the host checkout. A worker in an isolated worktree asking
  about `src/auth.ts` gets the host's answer for that path. For structural
  questions — who calls this, what breaks if I change it — that is the correct
  answer and the reason to ask. For "what did I just write", it is stale. Skills
  say so, and the worker tool descriptions say so.
- **Read-only, and a subset.** Only tools that map onto an existing
  `HostRequest` method ship to workers. No new Console capability is invented to
  widen the worker surface, because the worker surface is the one place where
  widening is hardest to review.
- **No Console, no tools.** If the Console is not running the worker registers
  no intelligence tools at all, rather than falling back to a local Core. A
  silent fallback is precisely the 8GB failure ADR-0041 was written about.

### 4. Trim the surface

Workflow prose moves out of `instructions.ts` into skills, where it is loaded
when relevant instead of on every session. `instructions.ts` keeps what a router
needs — which pack answers which kind of question — and drops the procedures it
was never the right place for.

## Consequences

**Good.** Prism composes itself for the first time: a review that runs DNA and
blast radius without being asked is a skill, not a prompt the user has to
remember. The teammate editing your code can finally check what it is about to
break. Instruction cost drops for every client on every session, and the removed
prose is not lost, only moved somewhere it can be longer and more specific.

**Costs.** The pack is a third distribution channel beside the MCP package and
the extensions, with its own release step and its own way to be stale. Skills
are prose, so nothing typechecks them — the manifest test catches a missing
file, not a skill that names a tool Prism removed; a check for that is
[P-S5](../milestones/M-067_shippable-product.md) work. Worker intelligence is
only as available as the Console, which makes the Console load-bearing for a
path that used to have no dependency at all.

**Reversible.** Deleting `packages/plugin` removes the pack and changes no
runtime behaviour. Restoring `mcpServers: {}` is a one-line revert.
