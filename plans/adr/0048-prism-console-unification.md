# ADR-0048: One Prism Console daemon, two planes

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-02 |
| Decision makers | Owner, Architect |
| Related milestones | [M-067](../milestones/M-067_shippable-product.md) |
| Supersedes | [ADR-0043](./0043-agent-dashboard-hub.md) (the two-port split only) |
| Amends | [ADR-0029](./0029-signal-provenance.md) (extends provenance to jobs), [ADR-0039](./0039-dispatch-chat-voice.md) (scopes the worktree-path ban to spoken copy) |

## Context

Prism ships two loopback web servers, and a user cannot tell them apart.

**`:17330`** is the Dispatch hub from ADR-0043. It is a user-level daemon that
outlives any editor, holds a per-install token in `~/.prism/hub/hub.json`,
pushes over SSE, and deliberately has no dependency on `@repo-prism/core` —
ADR-0043 kept Core out so the always-on process would stay small.

**`:17321`** is the extension's browser bridge. It starts lazily when someone
runs *Prism: Open in Browser*, serves the extension's own webview bundle over
HTTP, and answers `POST /api/host` from the `PrismSession` the extension
already indexed. It has **no token at all** and sets
`Access-Control-Allow-Origin: *`, so any page in any browser tab can read a
full repository analysis out of it. It also dies with the editor.

So the intelligence UI and the jobs UI are different apps, on different ports,
with different security models, and only one of them survives closing the IDE.

There is a third problem behind those two. `packages/app-shell/src/JobsScreen.tsx`
is a complete, tested jobs UI with a clean `JobsPort` seam — and it is mounted
nowhere. The board people actually see is a second, simpler implementation at
`packages/dispatch-hub/src/dashboard/board.tsx`: one 960px column, no router,
no loading state, and review markup pointing at CSS classes that have no rules.

## Decision

**One daemon on `:17330`, the Prism Console, with two planes.**

1. **The Jobs plane stays Core-free and always on.** Registry, job snapshots,
   SSE, the drain loop from ADR-0047. This is ADR-0043's daemon unchanged.
2. **The Intelligence plane `await import()`s `@repo-prism/core` on first
   use.** Not at boot. A user who never opens an intelligence view never pays
   for Core, which preserves ADR-0043's intent — restated as *no Core until
   asked* rather than *no Core ever*.
3. **One Core session at a time, evicted when idle.** Opening a second
   workspace closes the first. An indexed session is hundreds of megabytes;
   caching several in an always-on background process is how a local-first
   tool earns a reputation for eating a laptop.
4. **`:17321` is retired.** *Open in Browser* points at the Console. The
   extension keeps its in-process `PrismSession` for the webview and no longer
   listens on a socket.
5. **The Console speaks the extension's existing RPC.** `POST /api/host` takes
   the same `HostRequest` and returns the same `HostResponse` the webview
   already uses, so `app-shell` mounts against it unchanged — but behind the
   Console's token and origin allowlist rather than `*`.
6. **`JobsScreen` is adopted and `dashboard/board.tsx` is deleted.** One jobs
   UI, reached through a hash router with Jobs, Workflows, Repos and
   Intelligence.
7. **Number integrity extends to jobs.** ADR-0029 and M-056 made "explicit no
   data" the rule for intelligence surfaces. The jobs surface never got it.
   Unknown renders as unknown; every truncated list says it is truncated; a
   workspace that fails to read shows as failed instead of vanishing; every
   payload carries an `asOf` and the UI marks itself stale when SSE drops.
8. **`prismhq.localhost` is the default name, `127.0.0.1` keeps working.**
9. **A job detail may show its worktree path; chat still may not.** ADR-0039
   banned worktree paths from user-facing copy, and that rule was enforced on
   the whole `JobSnapshot`. It was aimed at *speech*: a path read aloud in
   chat is noise. A job detail is the opposite case — someone reading it is
   trying to go open the branch, and withholding the path makes the screen
   useless for the one thing it is for. The path therefore travels in its own
   `worktreePath` field, rendered only on the expanded detail, and no voice
   surface (`job-voice`, `statusline`, `notice`) reads it. The test that used
   to assert "no path anywhere in the snapshot" now asserts "no path in any
   field a voice surface reads", which is the property ADR-0039 actually
   wanted.

## The name, and why not nginx

Two separable problems: the **name** is DNS, the **port** is privilege.

A reverse proxy solves neither well. The only thing it buys is dropping
`:17330` from the URL by binding port 80, which needs root on macOS and Linux,
and it adds an install plus a managed service to a local-first tool.

`http://prismhq.localhost:17330` is the default. RFC 6761 reserves
`.localhost`; Chrome, Edge, Safari and Firefox all resolve `*.localhost` to
loopback with no DNS lookup, no hosts file and no sudo. It works offline, a
corporate resolver cannot break it, and browsers treat it as a secure context.

`http://local.prismhq.in:17330` is available opt-in as a branded alias
(`PRISM_CONSOLE_ALIAS=1`) — one A record at `127.0.0.1` with no server behind
it, the `lvh.me` trick. It carries three honest downsides: DNS rebinding
protection on many corporate resolvers refuses to return a loopback address
for a public name; it needs a resolver, so it breaks offline; and it is not a
secure context, because browsers judge that by name, not by resolved IP.

HTTPS on a custom name is rejected. A wildcard certificate for
`*.local.prismhq.in` would ship its private key inside an npm package, which
gets it revoked. Plex avoids that by minting per-install certs from a hosted
service, and we are deliberately shutting hosted infrastructure down.

The token requirement does not change. The origin allowlist is what stops a DNS
rebinding attack from a hostile origin, so every enabled name is added to it
explicitly and nothing wildcards a public suffix.

## Options Considered

### Option A — One daemon, two planes, lazy Core (chosen)

- Pros: one URL, one token, one UI; the untokenized `*` bridge disappears;
  intelligence survives closing the editor; the Console becomes the single
  index owner, which is what makes P-S4's worker MCP safe.
- Cons: the always-on process can now grow to hold a Core session; a browser
  session and the extension can index the same repository twice.

### Option B — Keep both ports, put a token on `:17321`

- Pros: much smaller change; no lazy-loading machinery.
- Cons: fixes the security hole and nothing else. Two apps, two URLs, two
  update paths, and intelligence still dies with the editor. It also leaves no
  home for the shared index P-S4 needs.

### Option C — Move Jobs into the extension bridge instead

- Pros: reuses the extension's existing session; no lazy import.
- Cons: backwards. Jobs must outlive the editor — that is the entire reason
  ADR-0043 made the hub a user-level daemon. It would also put Dispatch inside
  the extension, which AGENTS.md forbids.

## Consequences

- Positive: one Console, one token, one origin allowlist; `Access-Control-Allow-Origin: *`
  on an unauthenticated Core endpoint is gone; `JobsScreen` finally ships and
  the duplicate board is deleted; the Console is the natural owner of the
  shared index for P-S4.
- Negative: the daemon's memory ceiling is now Core-sized once someone opens an
  intelligence view; the extension webview and a Console browser tab can hold
  two sessions on the same repository; a lazy `import()` inside a bundled
  daemon needs care so Core is not pulled into the always-on path by accident.
- Follow-ups: P-S4 gives workers MCP access over this Console; P-S5 documents
  the Console and rebuilds the IDE MCP card against it.

## Compliance

- [x] Updates Master Plan if roadmap impacted — M-067
- [x] Updates package README(s) if API impacted — dispatch-hub, vscode-extension
- [x] Linked from milestone doc — M-067
