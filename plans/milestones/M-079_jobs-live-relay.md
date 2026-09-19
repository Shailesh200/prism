# M-079 — Jobs Live Relay

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-079-jobs-live-relay` |
| Depends on | M-078 Verified |
| Packages | `dispatch`, `mcp-server`, `cli`, TUI / MCP App host |
| Program | [PROGRAM_prism-2.0.md](./PROGRAM_prism-2.0.md) §8 |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §5 M-079 |

## 1. Goal

This host chat (TUI + editor MCP App) is the live job glass and the steer. No “Watch live at Console.” Dashboard Jobs stays the slim archive from M-078.

## 2. In scope

Isolated worker streamed + steered here via `job_control`. Live card: start → lines → one open choice → Review. Drop Console URL from `wake` / job messages for the live path.

## 3. Out of scope

Options 2 / 4 / 6. Pulse/Board as cockpit. Dashboard Pause/Cancel/Resume (already stripped). Package merges.

## 4. Definition of Done

- [ ] TUI: start → live card → steer → verify, no Console URL
- [ ] Editor chat: same via MCP App
- [ ] Dashboard Jobs still archive-only
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Master Plan §8.1 + §9 + §10. No commits until the owner asks. What-changed snippet after Verified.

## 6. After merge

Open **M-080** from `main`.
