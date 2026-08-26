import { describe, expect, it } from "vitest";
import { mcpConnectPolicy } from "./oauth-ui.js";

describe("MCP connect host policy", () => {
  it("uses Cursor's Authenticate control and a Continue card", () => {
    const policy = mcpConnectPolicy({
      clientName: "cursor",
      elicitation: { form: {}, url: {} },
    });
    expect(policy.attemptUrl).toBe(true);
    expect(policy.openPage).toBe(false);
    expect(policy.confirm).toBe(true);
  });

  it("opens Prism Auth for Claude and skips the extra Continue card", () => {
    const policy = mcpConnectPolicy({
      clientName: "claude-code",
      elicitation: { url: {} },
    });
    expect(policy.attemptUrl).toBe(true);
    expect(policy.openPage).toBe(true);
    expect(policy.confirm).toBe(false);
  });

  it("falls back to opening the page when the host has no elicitation", () => {
    const policy = mcpConnectPolicy({ clientName: "other" });
    expect(policy.attemptUrl).toBe(false);
    expect(policy.openPage).toBe(true);
    expect(policy.confirm).toBe(false);
  });
});
