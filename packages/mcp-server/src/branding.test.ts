import { describe, expect, it } from "vitest";
import {
  prismMcpImplementation,
  prismServerIcons,
  SERVER_ICON_HTTPS,
  SERVER_NAME,
  SERVER_TITLE,
  SERVER_WEBSITE_URL,
} from "./branding.js";

describe("MCP server branding", () => {
  it("advertises the Prism mark and title on initialize", () => {
    const info = prismMcpImplementation("1.1.1");
    expect(info.name).toBe(SERVER_NAME);
    expect(info.title).toBe(SERVER_TITLE);
    expect(info.version).toBe("1.1.1");
    expect(info.websiteUrl).toBe(SERVER_WEBSITE_URL);
    const icons = prismServerIcons();
    expect(icons.some((icon) => icon.src === SERVER_ICON_HTTPS)).toBe(true);
    expect(
      icons.some(
        (icon) =>
          icon.mimeType === "image/png" &&
          icon.src.startsWith("data:image/png;base64,"),
      ),
    ).toBe(true);
  });
});
