import { describe, expect, it } from "vitest";
import { claudeToolId, PRISM_MCP_SERVER } from "./tool-ids.js";

describe("Claude Code tool ids (round 4)", () => {
  it("prefixes the server name prism install registers", () => {
    expect(PRISM_MCP_SERVER).toBe("prism");
    expect(claudeToolId("prepare_change")).toBe("mcp__prism__prepare_change");
  });
});
