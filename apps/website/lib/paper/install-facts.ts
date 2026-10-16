import {
  PRISM_CLAUDE_CODE_COMMAND,
  PRISM_CODEX_TOML,
  PRISM_MCP_JSON_STRING,
} from "@/lib/mcp-install";

/** CLI check. Real binary is `prism` from `@repo-prism/cli`. There is no `prism start`. */
export const DOCTOR_COMMAND = "npx -y @repo-prism/cli doctor";

export const NODE_REQUIREMENT = "Needs Node.js 22 or newer.";

export const CLAUDE_COMMAND = PRISM_CLAUDE_CODE_COMMAND;

export const MCP_JSON = PRISM_MCP_JSON_STRING.trimEnd();

/** Codex TOML from the install guide, plus the CA env from mcp-install.json. */
export const CODEX_TOML = `${PRISM_CODEX_TOML.trimEnd()}

[mcp_servers.prism.env]
NODE_USE_SYSTEM_CA = "1"
`;

/**
 * opencode's local MCP shape from the v7 design, with this repo's server command.
 * This checkout does not contain an opencode installer; the command matches mcp-install.json.
 */
export const OPENCODE_JSON = `{
  "mcp": {
    "prism": {
      "type": "local",
      "command": ["npx", "-y", "--prefer-online", "@repo-prism/mcp-server@latest"],
      "enabled": true,
      "environment": { "NODE_USE_SYSTEM_CA": "1" }
    }
  }
}
`;

export const CLIENTS = [
  {
    slug: "claude-code",
    name: "Claude Code",
    lede: "Add the Prism MCP server with the Claude Code CLI. The server resolves the open folder from MCP roots. No workspace flag.",
    command: CLAUDE_COMMAND,
    lines: ["Restart Claude Code, then ask in plain words."],
    configPath: "~/.claude.json",
    configLang: "json",
    config: MCP_JSON,
    configNote:
      "For one repo, put the same mcpServers.prism entry in .mcp.json at the repo root.",
    writes: [
      ["~/.claude.json", "The Prism MCP server, under mcpServers.prism"],
      [
        "Project .mcp.json",
        "The same entry, when you want it only in this repo",
      ],
    ],
  },
  {
    slug: "cursor",
    name: "Cursor",
    lede: "Cursor reads ~/.cursor/mcp.json, or .cursor/mcp.json in one repo. The Add to Cursor button opens the same entry.",
    command: DOCTOR_COMMAND,
    lines: ["Run this in the repo after Cursor lists the prism server."],
    configPath: "~/.cursor/mcp.json",
    configLang: "json",
    config: MCP_JSON,
    configNote: "For one repo only, use .cursor/mcp.json in the repo root.",
    writes: [
      ["~/.cursor/mcp.json", "The Prism MCP server for every project"],
      [".cursor/mcp.json", "The same entry, scoped to one repo"],
    ],
  },
  {
    slug: "codex",
    name: "Codex",
    lede: "Codex reads ~/.codex/config.toml. The server command is the same npx entry as the other clients.",
    command: DOCTOR_COMMAND,
    lines: ["Run Codex from the project after the config is saved."],
    configPath: "~/.codex/config.toml",
    configLang: "toml",
    config: CODEX_TOML.trimEnd(),
    configNote:
      "NODE_USE_SYSTEM_CA lets the npm download trust a corporate proxy CA.",
    writes: [
      ["~/.codex/config.toml", "The Prism MCP server, as [mcp_servers.prism]"],
    ],
  },
  {
    slug: "opencode",
    name: "opencode",
    lede: "opencode can run Prism as a local MCP server. This repo ships the server command; it does not write opencode.json for you.",
    command: DOCTOR_COMMAND,
    lines: ["Restart opencode after the config is saved."],
    configPath: "~/.config/opencode/opencode.json",
    configLang: "json",
    config: OPENCODE_JSON.trimEnd(),
    configNote:
      "For one repo, the same mcp.prism object can live in opencode.json at the repo root.",
    writes: [
      ["~/.config/opencode/opencode.json", "User-level MCP entry"],
      ["opencode.json", "The same entry, for one repo"],
    ],
  },
] as const;

export type InstallClient = (typeof CLIENTS)[number];
