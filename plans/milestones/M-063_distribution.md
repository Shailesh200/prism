# M-063 — Distribution and Proof

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-063-distribution` (from latest `main`) |
| Depends on | M-062 |
| Unlocks | — (end of completion program) |
| Packages | `apps/website`, `scripts/`, `@repo-prism/mcp-server`, root README, docs |
| Amends | — |

## 1. Goal

The marketing tail — everything left that is in-repo. Publish proof that Prism saves agent tokens,
make MCP install one click, update URLs after the owner's Vercel go-live, and ship a killer demo
that shows the wedge: structural intelligence before an edit.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **Benchmark harness** | No published proof that Prism reduces agent tool calls and tokens. | `scripts/bench/agent-orientation.ts`: standard questions ("what is this repo", "is this edit safe") answered with and without Prism on three fixture repos; measure tool calls and tokens. Publish `plans/notes/benchmarks.md` and a `/benchmarks` page on the website. |
| **One-click MCP install** | MCP setup requires manual JSON editing. | Copyable config JSON plus deep-link install buttons for Cursor and Claude on the website and README; verified in both clients. |
| **MCP registry listing** | Server not listed in a public MCP registry. | Server manifest prepared in-repo; submission is an owner action (noted in the milestone). |
| **URL updates** | README, Marketplace and Open VSX homepage URLs still point at old domains. | Update to `https://www.prismhq.in` after the owner's Vercel go-live (handoff §5 in `apps/website/OWNER_HANDOFF.md`). |
| **Killer demo** | No side-by-side proof asset for marketing. | Scripted side-by-side: agent edits a fixture repo with and without Prism; recorded GIF on the README and website. |
| **CHANGELOG + whats-new** | No single entry covering the completion program. | CHANGELOG + `/whats-new` entry for the whole M-053–M-063 program. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Owner-only Vercel import, DNS, `/admin` protection | `apps/website/OWNER_HANDOFF.md` |
| MCP registry submission (external) | Owner action after manifest is ready |
| Language expansion | Next planning cycle |
| Manager dashboards | Not planned |

## 4. Definition of Done

- [ ] M-062 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [ ] Benchmark harness run; `plans/notes/benchmarks.md` and `/benchmarks` page published
- [ ] One-click MCP install verified in Cursor and Claude
- [ ] MCP server manifest prepared in-repo
- [ ] URLs updated to `https://www.prismhq.in` (after owner Vercel go-live)
- [ ] Killer demo GIF on README and website
- [ ] CHANGELOG + `/whats-new` entry for the completion program
- [ ] `bun run verify:milestone` green
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- Prism Completion Program (owner plan, 2026-08-08) — Phase 8
- [M-054 Public Website](./M-054_website.md) · [M-055 Website Marketing Motion](./M-055_website-motion.md)
- [apps/website/OWNER_HANDOFF.md](../../apps/website/OWNER_HANDOFF.md) — Vercel and domain handoff
- [M-058 Agent Surface v2](./M-058_agent-surface.md) — MCP tool surface being marketed
