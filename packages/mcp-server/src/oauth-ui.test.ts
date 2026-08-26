import { describe, expect, it } from "vitest";
import { confirmElicitationAccepted, mcpConnectPolicy } from "./oauth-ui.js";

describe("MCP connect host policy", () => {
  it("uses Cursor's Authenticate control and skips the Continue card Cursor auto-cancels", () => {
    const policy = mcpConnectPolicy({
      clientName: "cursor",
      elicitation: { form: {}, url: {} },
    });
    expect(policy.attemptUrl).toBe(true);
    expect(policy.openPage).toBe(false);
    expect(policy.confirm).toBe(false);
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

  it("still offers Continue on a generic host that only has form elicitation", () => {
    const policy = mcpConnectPolicy({
      clientName: "generic-ide",
      elicitation: { form: {} },
    });
    expect(policy.confirm).toBe(true);
  });
});

describe("confirm elicitation actions", () => {
  it("treats host cancel as skip-the-card, not a user no", () => {
    expect(confirmElicitationAccepted({ action: "cancel" })).toBe(true);
  });

  it("treats decline or Continue=false as abort", () => {
    expect(confirmElicitationAccepted({ action: "decline" })).toBe(false);
    expect(
      confirmElicitationAccepted({
        action: "accept",
        content: { continue: false },
      }),
    ).toBe(false);
  });

  it("treats accept as continue", () => {
    expect(confirmElicitationAccepted({ action: "accept" })).toBe(true);
    expect(
      confirmElicitationAccepted({
        action: "accept",
        content: { continue: true },
      }),
    ).toBe(true);
  });
});
