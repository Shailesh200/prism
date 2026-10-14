# M-094 — Envelope v2

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-094-envelope-v2` (from latest `main`) |
| Depends on | M-093 Verified |
| Unlocks | M-095 |
| Packages | `envelope`, `mcp-server` (`tool-registry.ts`, safety hooks), `plugin` (hooks), `cli` (`prism envelope`), `app-shell` / `vscode-extension` (Iris screen) |
| ADR | [ADR-0066](../adr/0066-envelope-product-surface.md) |

## 1. Goal

Every agent session ends with one honest line: what Prism put into context, what it cost, and, once calibrated, what it saved. Program §6.

## 2. In scope

| Item | Detail |
|---|---|
| Session id | Written by the session-start hook; carried by tool calls (via MCP client session where available, else time-window join), hook injections and the receipt |
| Hook entries | Auto-Prepare and receipt text recorded with `source: hook` |
| Budgets | One per-tool table (bytes); over-budget calls flagged in the ledger |
| Saved estimate | Field present, shown as `—` / "not calibrated yet" until M-098 fills the baseline table |
| Receipt footer | `Envelope  N calls · X tokens in · est. — saved · K over budget` |
| CLI | `prism envelope` (today / 7 days / by tool / top over-budget), `--json` |
| Iris screen | Prepare history, Envelope trend, receipts list; one screen in the IDE webview and loopback dashboard; reuse `@repo-prism/ui` primitives |
| Privacy | Schema test: no bodies, prompts or file contents; `PRIVACY.md` updated |

## 3. Out of scope

- Calibrating "saved" (M-098). Team or cloud aggregation (never).

## 4. DoD

- [ ] Every Claude Code smoke session with edits shows the Envelope footer in its receipt
- [ ] `prism envelope` matches a hand count on a recorded session
- [ ] Over-budget alarm fires on a fixture `list_features` call
- [ ] Privacy schema test passes; `PRIVACY.md` updated
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · smoke transcript `plans/notes/smoke/M-094.md` · screenshot of the Iris screen in the milestone notes.
