/**
 * What the Prism Console can tell a UI about the world outside Core.
 *
 * Lives here rather than in the RPC protocol because both ends need it and
 * they cannot share the protocol module: `@repo-prism/host-session` imports
 * Core, and the IDE's React shell must not. `AppView` is already duplicated
 * across that same gap, and one copy of a type is enough of those.
 *
 * One shape rather than three calls: the Integrations screen asks whether the
 * Console is up, what it is, and what the agent window has connected — all at
 * once, and a webview round trip is the expensive part (M-067 P-S5).
 */

export type HostConnectorInfo = {
  /** The plugin or server name, as the host knows it. */
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** `cursor`, `claude`, or both. A connector can be in more than one. */
  readonly hosts: readonly string[];
  /** Skill directory names shipped with the plugin, if any. */
  readonly skills: readonly string[];
  /** `http`, `sse`, `stdio`, or absent when no MCP server is declared. */
  readonly transport?: string;
  /** Where it was found, so "why does Prism think this is here" has an answer. */
  readonly source: string;
};

export type ConsoleStatus = {
  /** Null when nothing is running. A normal state, not an error. */
  readonly console: { readonly url: string; readonly port: number } | null;
  readonly version?: string;
  /** How many repositories the Console is watching. */
  readonly workspaces?: number;
  /** Connectors the agent window already has (ADR-0049). */
  readonly connectors: readonly HostConnectorInfo[];
  /** Places that exist but could not be read, so a gap is explainable. */
  readonly unreadable: readonly {
    readonly path: string;
    readonly detail: string;
  }[];
};

/** The answer when no host supplied a Console lookup. */
export const NO_CONSOLE_STATUS: ConsoleStatus = {
  console: null,
  connectors: [],
  unreadable: [],
};
