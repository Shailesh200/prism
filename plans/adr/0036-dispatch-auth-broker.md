# ADR-0036: Prism Auth broker for Dispatch OAuth

| Field | Value |
|---|---|
| Status | Superseded by [ADR-0049](./0049-host-delegated-integrations.md) |
| Date | 2026-08-26 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v1 (`dispatch/v1`) |
| Supersedes | — |
| Extends | [ADR-0035](./0035-dispatch-vertical.md) |

## Context

Dispatch connectors (GitHub, Linear, Jira, Slack, Notion, Google Calendar) need
OAuth. End users must not create vendor apps or paste client ids/secrets into
Prism. Those secrets also must not ship in `@repo-prism/mcp-server` on npm —
anyone could extract them.

The vendor redirect URI has to be a stable HTTPS origin. Loopback
`http://127.0.0.1:8765/callback` cannot be the URI registered on a shared Prism
OAuth app, because the token exchange needs the same redirect URI the vendor
saw. A small broker owns that HTTPS origin.

Local-first analysis is unchanged: the broker is **auth only**. It never sees
the repository, the index, or Dispatch jobs.

## Decision

1. **Prism Auth** is the OAuth broker at `https://auth.prismhq.in` (same Vercel
   project as the public website; extra domain). Handlers live in
   `@repo-prism/dispatch-auth` and are mounted at `/oauth/*`.
2. **One Prism-owned OAuth app per vendor.** Client ids/secrets are Vercel env
   (`PRISM_AUTH_*`). Users only complete the vendor grant in a browser.
3. **Flow:** local MCP binds `127.0.0.1:8765` → opens
   `https://auth.prismhq.in/oauth/start?driver=…&state=…` → broker redirects to
   the vendor with `redirect_uri=https://auth.prismhq.in/oauth/callback` →
   broker exchanges the code (secret stays on the server) → 302 to
   `http://127.0.0.1:8765/callback?code=<short-lived encrypted pickup>` → local
   MCP POSTs the pickup to `/oauth/redeem` → stores tokens in the OS keychain.
   Completing that grant is still the human consent (ADR-0035).
4. **No persistence of user tokens on the broker.** Pickup blobs are encrypted
   (AES-256-GCM) with a server secret, TTL ~2 minutes, not written to a
   database. The vendor OAuth `state` is the same kind of sealed blob (no
   session store).
5. **Dispatch defaults to that broker URL.** Override with
   `PRISM_DISPATCH_AUTH_BROKER_URL` for local broker testing. Do not ask users
   for client ids. A BYO app in env/file remains an undocumented owner escape
   hatch only.

## Options Considered

### Option A — Prism Auth broker (chosen)

- Pros: Users never create OAuth apps; secrets never in npm; one redirect URI
  per vendor; tokens still local.
- Cons: Deploy + vendor app registration is owner work; connect needs the
  network for the grant; a short-lived encrypted pickup appears on the
  loopback URL.

### Option B — Ship client ids in the MCP package

- Pros: No hosted service.
- Cons: Secrets leak; several vendors require a confidential client.

### Option C — Each user brings their own OAuth app

- Pros: No Prism-hosted secrets.
- Cons: Rejected by the owner — not a product flow.

### Option D — Nested marketplace MCPs

- Pros: Reuse Cursor/Claude listings.
- Cons: Prism cannot read another MCP's tokens; start-my-day cannot own the
  briefing (see Dispatch product notes).

## Consequences

- Positive: `connect Google Calendar` is grant-in-browser; catalog/CTAs no
  longer mention client ids.
- Negative: Prism Auth must be deployed and each vendor app approved (testing
  mode first). Until a driver has `PRISM_AUTH_*` env, connect says that
  connector is not enabled yet — not “create your own app”.
- Follow-ups: native host Authenticate / open-page connect UX (ADR-0037);
  Cursor worker SDK login (ADR-0038); register vendor apps; add
  `auth.prismhq.in` on the website Vercel project. Refresh-token renewal is
  `POST /oauth/refresh` on the broker (Dispatch never ships vendor secrets).

## Compliance

- [x] Updates Master Plan if roadmap impacted — Dispatch vertical, not an
      Intelligence milestone
- [x] Updates package README(s) if API impacted — dispatch, dispatch-auth,
      website owner handoff, PRIVACY
- [x] Linked from milestone doc — ADR-0035 follow-up (public OAuth clients)
