import { describe, expect, it } from "vitest";
import {
  discoverHostConnectors,
  connectorCovers,
  cursorProjectSlug,
  labelFor,
  serverEntriesOf,
  transportOf,
} from "./host-connectors.js";

/**
 * A fake filesystem keyed by absolute path. Directories are arrays, files are
 * strings, so a test reads as a picture of the disk it describes.
 */
function fakeFs(tree: Record<string, string | string[]>) {
  return {
    readFileImpl: async (path: string) => {
      const hit = tree[path];
      if (typeof hit !== "string") throw new Error(`ENOENT ${path}`);
      return hit;
    },
    readDirImpl: async (path: string) => {
      const hit = tree[path];
      if (!Array.isArray(hit)) throw new Error(`ENOTDIR ${path}`);
      return hit;
    },
  };
}

const HOME = "/home/dev";
const CACHE = `${HOME}/.cursor/plugins/cache`;
const SLACK = `${CACHE}/cursor-public/slack/abc123`;

const slackTree: Record<string, string | string[]> = {
  [CACHE]: ["cursor-public"],
  [`${CACHE}/cursor-public`]: ["slack"],
  [`${CACHE}/cursor-public/slack`]: ["abc123"],
  [`${CACHE}/cursor-public/slack/abc123`]: [".cursor-plugin", "skills"],
  [`${SLACK}/.cursor-plugin/plugin.json`]: JSON.stringify({
    name: "slack",
    description: "Slack MCP server.",
  }),
  [`${SLACK}/.claude-plugin/plugin.json`]: JSON.stringify({ name: "slack" }),
  [`${SLACK}/.mcp.json`]: JSON.stringify({
    mcpServers: {
      slack: {
        type: "http",
        url: "https://mcp.slack.com/mcp",
        oauth: { clientId: "secret-looking-value" },
      },
    },
  }),
  [`${SLACK}/skills`]: ["slack-search", "block-kit"],
};

describe("cursorProjectSlug", () => {
  it("matches Cursor's on-disk project folder name", () => {
    expect(cursorProjectSlug("/Users/me/Prism")).toBe("Users-me-Prism");
    expect(cursorProjectSlug("/repo")).toBe("repo");
  });
});

describe("labelFor", () => {
  it("turns plugin slugs into product names", () => {
    expect(labelFor("google-calendar")).toBe("Google Calendar");
    expect(labelFor("github")).toBe("GitHub");
    expect(labelFor("notion-workspace")).toBe("Notion Workspace");
    expect(labelFor("linear")).toBe("Linear");
  });
});

describe("connectorCovers", () => {
  it("matches a vendor from the plugin id or label", () => {
    const slack = [{ id: "plugin-slack-slack", label: "Slack" }];
    expect(connectorCovers(slack, "slack")).toBe(true);
    expect(connectorCovers(slack, "github")).toBe(false);
    expect(
      connectorCovers(
        [{ id: "google-calendar", label: "Google Calendar" }],
        "calendar",
      ),
    ).toBe(true);
  });
});

describe("transportOf", () => {
  it("prefers a declared type, then infers from url or command", () => {
    expect(transportOf({ type: "sse", url: "x" })).toBe("sse");
    expect(transportOf({ url: "https://x" })).toBe("http");
    expect(transportOf({ command: "node" })).toBe("stdio");
    expect(transportOf({})).toBeUndefined();
    expect(transportOf("nope")).toBeUndefined();
  });

  // Slack ships `type`, Linear ships `transport`. Both are on this machine.
  it("accepts the `transport` spelling too", () => {
    expect(transportOf({ transport: "http", url: "https://x" })).toBe("http");
  });
});

describe("serverEntriesOf", () => {
  it("reads the wrapped shape", () => {
    expect(
      Object.keys(serverEntriesOf({ mcpServers: { slack: { url: "x" } } })),
    ).toEqual(["slack"]);
  });

  // The Linear plugin's `mcp.json` has no wrapper at all.
  it("reads a bare map of server entries", () => {
    expect(
      Object.keys(
        serverEntriesOf({ linear: { url: "https://x", transport: "http" } }),
      ),
    ).toEqual(["linear"]);
  });

  it("ignores JSON that merely sits next to a manifest", () => {
    expect(serverEntriesOf({ name: "slack", version: "1.0.0" })).toEqual({});
    expect(serverEntriesOf({})).toEqual({});
    expect(serverEntriesOf(null)).toEqual({});
  });
});

describe("discoverHostConnectors", () => {
  const repo = "/repo";
  const slackSession = `${HOME}/.cursor/projects/repo/mcps/plugin-slack-slack`;

  it("ignores a plugin that is only in the download cache", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      workspaceRoot: repo,
      ...fakeFs(slackTree),
    });
    expect(result.connectors).toEqual([]);
  });

  it("ignores a session plugin that still needs mcp_auth", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      workspaceRoot: repo,
      ...fakeFs({
        [`${HOME}/.cursor/projects/repo/mcps`]: ["plugin-slack-slack"],
        [`${slackSession}/tools`]: ["mcp_auth.json"],
        [`${slackSession}/SERVER_METADATA.json`]: JSON.stringify({
          serverName: "slack",
        }),
      }),
    });
    expect(result.connectors).toEqual([]);
  });

  it("lists a session plugin that already has real tools", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      workspaceRoot: repo,
      ...fakeFs({
        [`${HOME}/.cursor/projects/repo/mcps`]: ["plugin-slack-slack", "prism"],
        [`${slackSession}/tools`]: ["slack_search.json", "mcp_auth.json"],
        [`${slackSession}/SERVER_METADATA.json`]: JSON.stringify({
          serverName: "slack",
        }),
      }),
    });
    expect(result.connectors).toEqual([
      {
        id: "slack",
        label: "Slack",
        hosts: ["cursor"],
        skills: [],
        source: slackSession,
      },
    ]);
  });

  // The whole premise of ADR-0049 is that Prism never touches a credential.
  it("never carries a credential-shaped value out of a host config", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      ...fakeFs({
        [`${HOME}/.cursor/mcp.json`]: JSON.stringify({
          mcpServers: {
            slack: {
              url: "https://mcp.slack.com/mcp",
              oauth: { clientId: "secret-looking-value" },
            },
          },
        }),
      }),
    });
    expect(JSON.stringify(result.connectors)).not.toContain(
      "secret-looking-value",
    );
    expect(JSON.stringify(result.connectors)).not.toContain("oauth");
  });

  it("reports one connector for a plugin installed in both hosts", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      workspaceRoot: repo,
      ...fakeFs({
        [`${HOME}/.cursor/projects/repo/mcps`]: ["plugin-slack-slack"],
        [`${slackSession}/tools`]: ["slack_search.json"],
        [`${slackSession}/SERVER_METADATA.json`]: JSON.stringify({
          serverName: "slack",
        }),
        [`${HOME}/.claude/plugins`]: ["slack"],
        [`${HOME}/.claude/plugins/slack`]: [".claude-plugin"],
        [`${HOME}/.claude/plugins/slack/.claude-plugin/plugin.json`]:
          JSON.stringify({ name: "slack" }),
      }),
    });
    expect(result.connectors.filter((row) => row.id === "slack")).toHaveLength(
      1,
    );
    expect(result.connectors[0]?.hosts).toEqual(["cursor", "claude"]);
  });

  it("reads MCP servers declared directly in a host config", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      ...fakeFs({
        [`${HOME}/.cursor/mcp.json`]: JSON.stringify({
          mcpServers: {
            linear: { type: "http", url: "https://mcp.linear.app" },
          },
        }),
      }),
    });
    expect(result.connectors).toEqual([
      {
        id: "linear",
        label: "Linear",
        hosts: ["cursor"],
        skills: [],
        transport: "http",
        source: `${HOME}/.cursor/mcp.json`,
      },
    ]);
  });

  // Telling Prism that Prism is connected is noise, and it would appear in a
  // Host Connectors list as if it were something to compose with.
  it("skips Prism's own MCP entry", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      ...fakeFs({
        [`${HOME}/.cursor/mcp.json`]: JSON.stringify({
          mcpServers: {
            prism: { command: "prism-mcp" },
            "prism-worker": { command: "prism-mcp" },
            slack: { url: "https://mcp.slack.com/mcp" },
          },
        }),
      }),
    });
    expect(result.connectors.map((row) => row.id)).toEqual(["slack"]);
  });

  it("picks up a workspace-scoped config alongside the user one", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      workspaceRoot: "/repo",
      ...fakeFs({
        [`${HOME}/.cursor/mcp.json`]: JSON.stringify({
          mcpServers: { slack: { url: "https://x" } },
        }),
        "/repo/.mcp.json": JSON.stringify({
          mcpServers: { sentry: { url: "https://y" } },
        }),
      }),
    });
    expect(result.connectors.map((row) => row.id)).toEqual(
      ["Sentry", "Slack"].map((l) => l.toLowerCase()),
    );
  });

  it("returns nothing rather than throwing on a machine with no hosts", async () => {
    const result = await discoverHostConnectors({ home: HOME, ...fakeFs({}) });
    expect(result.connectors).toEqual([]);
    expect(result.unreadable).toEqual([]);
  });

  // A missing file is normal; a present file that will not parse is a gap the
  // user should be able to see rather than a silently shorter list.
  it("names a config it could not parse instead of dropping it", async () => {
    const result = await discoverHostConnectors({
      home: HOME,
      ...fakeFs({ [`${HOME}/.cursor/mcp.json`]: "{ not json" }),
    });
    expect(result.connectors).toEqual([]);
    expect(result.unreadable[0]?.path).toBe(`${HOME}/.cursor/mcp.json`);
  });
});
