import { describe, expect, it } from "vitest";
import {
  PULSE_WEBSITE_ID,
  classifyClick,
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
      installCopyTarget("npm install -g @prismapp/cli && prism install claude"),
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

  it("names the important clicks", () => {
    expect(
      classifyClick({ href: "/install", place: "nav", button: true }),
    ).toEqual({ name: "cta_click", target: "/install" });
    expect(classifyClick({ href: "/docs", place: "nav" })).toEqual({
      name: "nav_click",
      target: "/docs",
    });
    expect(classifyClick({ href: "/privacy", place: "footer" })).toEqual({
      name: "footer_click",
      target: "/privacy",
    });
    expect(classifyClick({ href: "/product/prepare", place: "page" })).toEqual({
      name: "product_click",
      target: "prepare",
    });
    expect(classifyClick({ href: "/install/cursor", place: "page" })).toEqual({
      name: "install_agent",
      target: "cursor",
    });
    expect(
      classifyClick({ href: "/docs/start/install", place: "docs" }),
    ).toEqual({ name: "docs_click", target: "/docs/start/install" });
    expect(
      classifyClick({
        href: "https://github.com/Shailesh200/prism",
        place: "nav",
        star: true,
      }),
    ).toEqual({ name: "star_click", target: "github" });
    expect(
      classifyClick({ href: "https://example.com/x", place: "page" }),
    ).toEqual({ name: "outbound_click", target: "example.com" });
    expect(
      classifyClick({
        href: "#2.0.2",
        place: "page",
        base: "https://www.prismhq.in/changelog",
      }),
    ).toEqual({ name: "changelog_version", target: "2.0.2" });
    expect(
      classifyClick({
        href: "#top",
        place: "page",
        base: "https://www.prismhq.in/changelog",
      }),
    ).toBeUndefined();
    expect(classifyClick({ place: "docs", search: true })).toEqual({
      name: "docs_search",
    });
    expect(prismhqEvents.navClick).toBe("nav_click");
  });
});
