# M-041 — Stack-aware utilities foundation (pre–Map UI)

| Field | Value |
|---|---|
| Branch | `milestone/M-041-stack-utilities-foundation` |
| Status | Not Started |
| Depends on | M-014 (Intelligence API), M-040 |
| Unlocks | M-017 / M-018 (Map consumes overlay contracts), further domain packs |
| Packages | `@prism/intelligence`, `@prism/shared`, `@prism/core`, optionally `@prism/cli` |

## Goal

Land the **measurement + ingest + opt-in runner substrate** for stack-aware utilities **before** Map UI (M-018), per [ADR-0008](../adr/0008-stack-aware-measurement-utilities.md).

Full domain feature lists live in [`BACKLOG_STACK_UTILITIES.md`](../BACKLOG_STACK_UTILITIES.md) — this milestone is foundation only.

## In Scope

- Ingest contracts for lab reports (Lighthouse / CWV JSON) in `@prism/shared`
- Local artifact placement under `.prism/ingest/` (or explicit path)
- Opt-in **local** Lighthouse (or equivalent) runner with UX callout:
  - dedicated local PORT
  - asynchronous run
  - report when ready
- Core APIs to list jobs + fetch latest web perf / CWV summary
- Attribution model supporting **app → route → chunk → component** levels (populate what lab data allows)
- CWV fields beyond LCP (CLS, INP at minimum in the schema)
- Consent hook stub for any future remote PageSpeed-style probe (disabled by default)

## Out of Scope

- Implementing entire domain backlogs (mobile, DevOps, SEO polish packs, …)
- Prism Cloud / auto network from Core
- Full Map UI (M-018) — only **contracts** Map will consume
- Fake component-level metrics when attribution is missing

## Definition of Done

- [ ] Ingest + CWV schemas documented and tested
- [ ] Opt-in local runner path documented (callout copy approved)
- [ ] Core can return a local report summary without network
- [ ] Map overlay DTO sketch agreed with M-017
- [ ] Backlog IDs FE-01…FE-03 marked Done or Partially done
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration (fixture LH JSON) · Manual runner smoke (opt-in) · Docs

## See also

- [BACKLOG_STACK_UTILITIES.md](../BACKLOG_STACK_UTILITIES.md)
- [ADR-0008](../adr/0008-stack-aware-measurement-utilities.md)
