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
    expect(
      installCopyTarget("npx -y --prefer-online @repo-prism/mcp-server@latest"),
    ).toBe("mcp");
    expect(installCopyTarget("npx -y @repo-prism/cli doctor")).toBe("cli");
    expect(
      installCopyTarget("code --install-extension prismhq.repo-prism"),
    ).toBe("ide");
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
