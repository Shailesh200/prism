# ADR-0037: Native host connect UX for Dispatch

| Field | Value |
|---|---|
| Status | Superseded by [ADR-0049](./0049-host-delegated-integrations.md) |
| Date | 2026-08-26 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v1 (`dispatch/v1`) |
| Supersedes | — |
| Extends | [ADR-0036](./0036-dispatch-auth-broker.md) |

## Context

Connect already goes through Prism Auth (`auth.prismhq.in`) and stores tokens
on the local machine (ADR-0036). The remaining friction was the *start* of
that grant: the MCP tool opened a browser itself and asked the agent to paste
a URL. Cursor already has a native Authenticate control for URL-mode
elicitation. Claude is happier opening the auth page. Users stay with Prism
when connect feels like a host-native login, not a scavenger hunt.

## Decision

1. **Same broker and same local token store.** This ADR does not change where
   secrets live. Prism Auth still holds vendor app credentials; the OS
   keychain still holds the user token.
2. **Dedicated steps** on every connect: review, prepare a local callback,
   authenticate, save locally, done. The MCP host reports them as progress /
   logging so the tool card is a short wizard, not a dump of JSON.
3. **Cursor:** URL-mode elicitation (`elicitation/create`, `mode: "url"`) so
   Cursor can render its native **Authenticate** button pointing at
   `https://auth.prismhq.in/oauth/start?…`. Clicking Authenticate opens
   Prism Auth / the vendor login (Google, Linear, etc.). Do not also `open` a
   window. Do **not** send a form Continue card first — Cursor advertises form
   elicitation then auto-returns `cancel`, which aborted connect before
   Authenticate appeared.
4. **Claude:** skip the extra Continue card; open the Prism Auth page. If the
   host also supports URL elicitation, still send it — opening the page is
   what the user asked for.
5. **Fallback:** if the host has no elicitation, or URL elicitation is
   rejected, open the page. Never ask the user for a client id.
6. **Dispatch stays SDK-free.** `@repo-prism/dispatch` owns the step machine
   and an `OAuthUiPort`. `@repo-prism/mcp-server` implements that port with
   MCP elicitation. Core still does not import Dispatch.

## Options Considered

### Option A — Host elicitation + Prism Auth (chosen)

- Pros: native Authenticate in Cursor; Claude opens the page; tokens stay
  local; no user-created OAuth apps.
- Cons: depends on the host declaring (or honouring) URL elicitation.

### Option B — Keep auto-opening the browser

- Pros: works everywhere.
- Cons: misses Cursor's Authenticate control; feels like a random popup.

### Option C — MCP Apps HTML wizard

- Pros: fully custom steps.
- Cons: not the native Authenticate button; more surface to maintain.

## Consequences

- Positive: `@prism connect Google Calendar` is a short native flow; Cursor
  shows Authenticate, which opens the vendor login.
- Negative: a host that advertises elicitation but never shows the UI will
  look hung until the 3-minute loopback timeout; we still include
  `authorizeUrl` in the tool result so the agent can recover. Agents that
  cannot invoke `integrations` must reload the prism MCP server rather than
  searching the repo. Worker sign-in reuses this Authenticate control
  ([ADR-0038](./0038-cursor-worker-sdk-login.md)).

## Compliance

- [x] Updates Master Plan if roadmap impacted — Dispatch vertical
- [x] Updates package README(s) if API impacted — dispatch, mcp-server, docs
- [x] Linked from ADR-0036
