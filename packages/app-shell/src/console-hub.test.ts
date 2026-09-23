import { describe, expect, it } from "vitest";
import { embedDashboardUrl } from "./console-hub.js";
import { dashboardLink } from "./hub-link.js";
import { explainIrisError } from "./hub/session.js";

describe("explainIrisError", () => {
  it("never says the Dashboard is not running", () => {
    expect(explainIrisError("Prism Dashboard is not running")).not.toMatch(
      /Dashboard is not running/i,
    );
    expect(explainIrisError("Job service is not available")).not.toMatch(
      /Dashboard is not running/i,
    );
  });
});

describe("dashboard embeds", () => {
  it("does not build an iframe URL — Iris and Skills are native now", () => {
    expect(
      embedDashboardUrl("http://prismhq.localhost:17330/?token=abc", "iris"),
    ).toBe("");
  });
});

describe("dashboardLink", () => {
  it("uses same-origin APIs on an HTTP dashboard", () => {
    const prev = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          protocol: "http:",
          href: "http://127.0.0.1:17331/?token=from-page",
        },
      },
    });
    try {
      expect(
        dashboardLink({
          console: {
            url: "http://prismhq.localhost:17330/?token=abc",
            port: 17330,
          },
          connectors: [],
          unreadable: [],
        }),
      ).toEqual({ base: "", token: "abc" });
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: prev,
      });
    }
  });
});
