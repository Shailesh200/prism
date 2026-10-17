import { describe, expect, it } from "vitest";
import {
  PULSE_WEBSITE_ID,
  installCopyTarget,
  installLinkAttrs,
  prismhqEvents,
  trackProps,
} from "./pulse";

describe("pulse", () => {
  it("ships the PrismHQ website id", () => {
    expect(PULSE_WEBSITE_ID).toBe("837be913-9493-45dc-8a1a-2483bc2b58e9");
  });

  it("tags install copy by command", () => {
    expect(installCopyTarget("claude mcp add prism -- prism-mcp")).toBe("mcp");
    expect(
      installCopyTarget(
        "npm install -g @repo-prism/cli && prism install claude",
      ),
    ).toBe("cli");
    expect(installCopyTarget("npm install @repo-prism/core")).toBe("core");
    expect(installCopyTarget("bun run verify:milestone")).toBe("source");
    expect(installCopyTarget("hello")).toBeUndefined();
  });

  it("tags Cursor and VS Code install deeplinks", () => {
    expect(
      installLinkAttrs("cursor://anysphere.cursor-deeplink/mcp/install"),
    ).toEqual(trackProps(prismhqEvents.installOpen, "cursor"));
    expect(installLinkAttrs("vscode:mcp/install?x=1")).toEqual(
      trackProps(prismhqEvents.installOpen, "vscode"),
    );
    expect(
      installLinkAttrs(
        "https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism",
      ),
    ).toEqual(trackProps(prismhqEvents.installOpen, "marketplace"));
    expect(
      installLinkAttrs("https://open-vsx.org/extension/prismhq/repo-prism"),
    ).toEqual(trackProps(prismhqEvents.installOpen, "openvsx"));
    expect(installLinkAttrs("/install")).toEqual({});
  });
});
