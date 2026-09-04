/**
 * What the Prism plugin pack contains (ADR-0050).
 *
 * One definition, two manifests. Cursor and Claude Code disagree about shape —
 * Cursor takes directory strings, Claude takes arrays of file paths — and a
 * pack maintained as two hand-written JSON files drifts within a release. The
 * drift is silent: the pack still installs, it just quietly lacks whichever
 * file someone forgot to add to the second list.
 */

export type SkillId =
  | "prism-review-pr"
  | "prism-safe-change"
  | "prism-verify-regression"
  | "prism-ship"
  | "prism-onboard";

export type CommandId = "prism-review" | "prism-check" | "prism-onboard";

export type PluginDefinition = {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author: { readonly name: string; readonly url: string };
  readonly homepage: string;
  readonly repository: string;
  readonly license: string;
  readonly keywords: readonly string[];
  readonly skills: readonly SkillId[];
  readonly commands: readonly CommandId[];
};

/**
 * The pack's version tracks `@repo-prism/mcp-server`, not this package.
 *
 * A user installing the pack is installing a way to talk to that server, and
 * two version numbers for one thing is a support question nobody wants to
 * answer. The build reads it rather than this file restating it.
 */
export function pluginDefinition(version: string): PluginDefinition {
  return {
    name: "prism",
    version,
    description:
      "Repository intelligence for coding agents. Maps, dependency graphs, blast radius and impact analysis over a local index — composed with the connectors your editor already has.",
    author: { name: "Prism", url: "https://www.prismhq.in" },
    homepage: "https://www.prismhq.in",
    repository: "https://github.com/Shailesh200/prism",
    license: "MIT",
    keywords: [
      "prism",
      "code-intelligence",
      "impact-analysis",
      "blast-radius",
      "dependency-graph",
      "code-review",
      "mcp",
    ],
    skills: [
      "prism-review-pr",
      "prism-safe-change",
      "prism-verify-regression",
      "prism-ship",
      "prism-onboard",
    ],
    commands: ["prism-review", "prism-check", "prism-onboard"],
  };
}

/** Cursor reads directory strings and resolves the tree itself. */
export function cursorManifest(def: PluginDefinition): Record<string, unknown> {
  return {
    name: def.name,
    displayName: "Prism",
    version: def.version,
    description: def.description,
    author: def.author,
    homepage: def.homepage,
    repository: def.repository,
    license: def.license,
    keywords: [...def.keywords],
    category: "productivity",
    skills: "./skills/",
    commands: "./commands/",
    mcpServers: "./mcp.json",
  };
}

/** Claude reads explicit file lists, so every entry has to be enumerated. */
export function claudeManifest(def: PluginDefinition): Record<string, unknown> {
  return {
    name: def.name,
    version: def.version,
    description: def.description,
    author: def.author,
    homepage: def.homepage,
    repository: def.repository,
    license: def.license,
    keywords: [...def.keywords],
    commands: def.commands.map((id) => `./commands/${id}.md`),
  };
}

/**
 * How a host launches the Prism MCP server.
 *
 * Deliberately byte-identical to `packages/mcp-server/mcp-install.json`, which
 * is what the website and the extensions hand out. Two spellings of the same
 * launch line is a support burden: someone installs the pack, hits a problem,
 * and the documented fix does not match what they have. A test asserts they
 * stay equal.
 */
export function mcpConfig(): Record<string, unknown> {
  return {
    mcpServers: {
      prism: {
        command: "npx",
        args: ["-y", "--prefer-online", "@repo-prism/mcp-server@latest"],
        env: {
          NODE_USE_SYSTEM_CA: "1",
        },
      },
    },
  };
}
