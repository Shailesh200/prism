import { describe, expect, it } from "vitest";
import {
  CONSOLE_ALIAS_HOST,
  CONSOLE_HOST,
  consoleHost,
  dashboardUrl,
} from "./paths.js";

describe("consoleHost", () => {
  it("speaks prismhq.localhost by default", () => {
    expect(consoleHost({})).toBe(CONSOLE_HOST);
    expect(dashboardUrl(17330, "tok", {})).toBe(
      "http://prismhq.localhost:17330/?token=tok",
    );
  });

  it("speaks the branded public name only when opted in", () => {
    expect(consoleHost({ PRISM_CONSOLE_ALIAS: "1" })).toBe(CONSOLE_ALIAS_HOST);
  });

  it("lets PRISM_CONSOLE_HOST override either default", () => {
    expect(consoleHost({ PRISM_CONSOLE_HOST: "127.0.0.1" })).toBe("127.0.0.1");
  });
});
