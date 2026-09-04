/**
 * Which agent window Prism is talking to.
 *
 * Rescued from `connect-ux.ts` when the OAuth stack was deleted (ADR-0049).
 * The connect flow is gone, but "am I inside Cursor or Claude Code" is still
 * a live question — the worker backend picks a different CLI for each
 * (ADR-0044), and the fill contract's wording depends on which connectors the
 * host has.
 *
 * The MCP client name is the only signal available, so this is a substring
 * match by design. It is a hint used to choose a default, never a security
 * boundary.
 */

export function clientLooksLikeCursor(name: string | undefined): boolean {
  return (name ?? "").toLowerCase().includes("cursor");
}

export function clientLooksLikeClaude(name: string | undefined): boolean {
  return (name ?? "").toLowerCase().includes("claude");
}
