import { describe, expect, it } from "vitest";
import {
  clearLocalPrismUi,
  dashboardLink,
  explainDashboardApiError,
} from "./WipePrismDataCard.js";

describe("explainDashboardApiError", () => {
  it("rewrites a dead-hub fetch as a wake hint", () => {
    expect(explainDashboardApiError("fetch failed")).toMatch(/prism wake/i);
    expect(explainDashboardApiError("Prism Dashboard is not running")).toMatch(
      /prism wake/i,
    );
    expect(explainDashboardApiError("fetch failed")).not.toMatch(
      /Dashboard is not running/,
    );
  });

  it("leaves a real API error alone", () => {
    expect(explainDashboardApiError("workspace is required")).toBe(
      "workspace is required",
    );
  });
});

describe("dashboardLink", () => {
  it("uses same-origin on the HTTP Dashboard", () => {
    const previous = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          protocol: "http:",
          href: "http://127.0.0.1:17331/#/settings",
          host: "127.0.0.1:17331",
        },
      },
    });
    try {
      expect(dashboardLink(undefined)).toEqual({ base: "", token: "" });
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
        value: previous,
      });
    }
  });
});

describe("clearLocalPrismUi", () => {
  it("removes every prism.* key from localStorage", () => {
    const store = new Map<string, string>([
      ["prism.settings.v1", "{}"],
      ["prism.domain-run.demo", "1"],
      ["keep.me", "yes"],
    ]);
    const memory = {
      get length() {
        return store.size;
      },
      key(index: number): string | null {
        return [...store.keys()][index] ?? null;
      },
      getItem(key: string): string | null {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        store.set(key, value);
      },
      removeItem(key: string): void {
        store.delete(key);
      },
      clear(): void {
        store.clear();
      },
    };
    const previous = (globalThis as { localStorage?: Storage }).localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: memory,
    });
    try {
      clearLocalPrismUi();
      expect(store.has("prism.settings.v1")).toBe(false);
      expect(store.has("prism.domain-run.demo")).toBe(false);
      expect(store.get("keep.me")).toBe("yes");
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          value: previous,
        });
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });
});
