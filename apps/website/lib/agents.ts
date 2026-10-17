/**
 * The four agents `prism install` wires, and what it writes for each.
 * Source: packages/cli/src/install/hosts.ts (user scope unless noted).
 */

export type AgentSlug = "claude-code" | "cursor" | "codex" | "opencode";

export type Agent = {
  slug: AgentSlug;
  name: string;
  /** The `prism install <client>` argument. */
  client: string;
  /** One line for the install overview. */
  gets: string;
  lede: string;
  /** Extra lines `prism install` prints after "installed for …". */
  notes?: string[];
  config: { lang: "json" | "toml"; path: string; projectHint?: string };
  writes: Array<[where: string, what: string]>;
  after: string;
};

export const AGENTS: Agent[] = [
  {
    slug: "claude-code",
    name: "Claude Code",
    client: "claude",
    gets: "MCP server, five hooks and the prism skill.",
    lede: "Claude Code gets the full set: the MCP server, five hooks and the prism skill. You get a file list before edits and a receipt after.",
    config: {
      lang: "json",
      path: "~/.claude.json",
      projectHint: "For one repo only, use .mcp.json in the repo root.",
    },
    writes: [
      ["~/.claude.json", "The Prism MCP server"],
      [
        "~/.claude/settings.json",
        "Five hooks: session start, prompt, before and after an edit, stop",
      ],
      ["~/.claude/skills", "The prism skill"],
    ],
    after: "Claude Code gets a verdict when the agent stops.",
  },
  {
    slug: "cursor",
    name: "Cursor",
    client: "cursor",
    gets: "MCP server, plus a rule file per repo.",
    lede: "Cursor gets the MCP server. In each repo, add --project to write a rule that asks the agent for the file list before editing and the verdict before it says it is done.",
    notes: [
      "Cursor reads rules per repository: in each one, run",
      "`prism install cursor --project` to add the prepare/receipt rule.",
    ],
    config: { lang: "json", path: "~/.cursor/mcp.json" },
    writes: [
      ["~/.cursor/mcp.json", "The Prism MCP server"],
      [
        ".cursor/rules/prism.mdc",
        "With --project: the rule to call prepare first and receipt at the end",
      ],
      ["~/.prism/config.json", "Turns on the receipt tool"],
    ],
    after:
      "In Cursor, Prism gives a receipt when the agent asks for one. The automatic verdict when the agent stops isn’t available in Cursor yet.",
  },
  {
    slug: "codex",
    name: "Codex",
    client: "codex",
    gets: "MCP server and a rule in AGENTS.md.",
    lede: "Codex gets the MCP server and a short rule in AGENTS.md. Prism only edits the lines between its own markers.",
    config: { lang: "toml", path: "~/.codex/config.toml" },
    writes: [
      ["~/.codex/config.toml", "The Prism MCP server, between Prism’s markers"],
      [
        "~/.codex/AGENTS.md",
        "A short rule between Prism’s markers (the repo’s AGENTS.md with --project)",
      ],
      ["~/.prism/config.json", "Turns on the receipt tool"],
    ],
    after: "Ask “what breaks if I change this?” and Codex asks Prism.",
  },
  {
    slug: "opencode",
    name: "opencode",
    client: "opencode",
    gets: "MCP server, a plugin and a rule in AGENTS.md.",
    lede: "opencode gets the MCP server, a plugin with Prism’s hooks (session start, before and after an edit, and stop) and a short rule in AGENTS.md.",
    config: {
      lang: "json",
      path: "~/.config/opencode/opencode.json",
      projectHint: "For one repo only, use opencode.json in the repo root.",
    },
    writes: [
      ["~/.config/opencode/opencode.json", "The Prism MCP server"],
      [
        "~/.config/opencode/plugins/prism.js",
        "A plugin that runs Prism’s hooks (with --project: .opencode/plugins/prism.js)",
      ],
      [
        "~/.config/opencode/AGENTS.md",
        "A short rule between Prism’s markers (the repo’s AGENTS.md with --project)",
      ],
      ["~/.prism/config.json", "Turns on the receipt tool"],
    ],
    after:
      "When the session goes idle, the plugin writes the verdict to opencode’s log; prism receipts shows it too.",
  },
];

export const agentBySlug = (slug: string) =>
  AGENTS.find((a) => a.slug === slug);
