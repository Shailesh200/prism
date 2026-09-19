# M-080 — Agent + CLI IA

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-080-agent-cli-ia` |
| Depends on | M-079 Verified |
| Packages | `mcp-server`, `cli`, `dispatch-hub` |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §4.7, §5 M-080 |

## 1. Goal

One orientation for agents. CLI grouped like the rail. Loopback Streamable HTTP `/mcp` on the daemon. Teach the advertised `app.` URL; write loopback until M-086 pairing exists.

## 2. In scope

Instructions hero list; `repository_overview` scoreboard + `open[]`; `prism overview --expand`; `prism mcp add`; daemon `http://127.0.0.1:17330/mcp`; publish *name* `@prismate/mcp` in source.

## 3. Out of scope

Delete tool registrations. Public DNS / GitHub / npm org (M-086). Pairing gateway on the public host. Marketplace publisher (M-081).

## 4. Definition of Done

- [ ] First-call scoreboard with `open[]`
- [ ] Loopback HTTP `/mcp` serves the same tools as stdio
- [ ] `prism mcp add` writes loopback (and documents the advertised URL)
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Master Plan §8.1 + §9 + §10. No commits until the owner asks.

## 6. After merge

Open **M-081** (Marketplace publisher) from `main`.
