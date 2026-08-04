import { describe, expect, it } from "vitest";
import {
  HOST_REQUEST_METHODS,
  parseHostRequest,
  parseWebviewToHost,
} from "./protocol-guards.js";

describe("parseHostRequest", () => {
  it("accepts a well-formed request", () => {
    const parsed = parseHostRequest({ id: "req-1", method: "dashboard" });
    expect(parsed.ok).toBe(true);
  });

  it("accepts every declared method", () => {
    for (const method of HOST_REQUEST_METHODS) {
      const parsed = parseHostRequest({ id: "req-1", method });
      expect(parsed.ok, `method ${method} should parse`).toBe(true);
    }
  });

  it.each([
    ["null", null],
    ["a string", "dashboard"],
    ["an array", []],
    ["a number", 7],
  ])("rejects %s", (_label, raw) => {
    expect(parseHostRequest(raw).ok).toBe(false);
  });

  it("rejects a missing id", () => {
    const parsed = parseHostRequest({ method: "dashboard" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain("id");
  });

  it("rejects an empty id", () => {
    expect(parseHostRequest({ id: "", method: "dashboard" }).ok).toBe(false);
  });

  it("rejects an unknown method", () => {
    const parsed = parseHostRequest({ id: "req-1", method: "rm -rf" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain("unknown request method");
  });

  it("rejects a non-string method", () => {
    expect(parseHostRequest({ id: "req-1", method: 42 }).ok).toBe(false);
  });
});

describe("parseWebviewToHost", () => {
  it("accepts a ready message", () => {
    expect(parseWebviewToHost({ type: "ready", view: "overview" }).ok).toBe(
      true,
    );
  });

  it("accepts a wrapped request", () => {
    const parsed = parseWebviewToHost({
      type: "request",
      request: { id: "req-1", method: "map", zoom: "feature" },
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects a wrapped request with an unknown method", () => {
    const parsed = parseWebviewToHost({
      type: "request",
      request: { id: "req-1", method: "definitelyNotAMethod" },
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a wrapped request that is not an object", () => {
    expect(parseWebviewToHost({ type: "request", request: null }).ok).toBe(
      false,
    );
  });

  it("rejects an unknown message type", () => {
    const parsed = parseWebviewToHost({ type: "evalArbitraryCode" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain("unknown message type");
  });

  it("requires a non-empty path on openFile", () => {
    expect(parseWebviewToHost({ type: "openFile", path: "src/a.ts" }).ok).toBe(
      true,
    );
    expect(parseWebviewToHost({ type: "openFile", path: "" }).ok).toBe(false);
    expect(parseWebviewToHost({ type: "openFile" }).ok).toBe(false);
    expect(parseWebviewToHost({ type: "openFile", path: 3 }).ok).toBe(false);
  });

  it("requires a string array on layers", () => {
    expect(parseWebviewToHost({ type: "layers", layers: ["heat"] }).ok).toBe(
      true,
    );
    expect(parseWebviewToHost({ type: "layers", layers: [1] }).ok).toBe(false);
    expect(parseWebviewToHost({ type: "layers", layers: "heat" }).ok).toBe(
      false,
    );
  });

  it("validates setAutoReindex fields", () => {
    expect(
      parseWebviewToHost({ type: "setAutoReindex", enabled: true }).ok,
    ).toBe(true);
    expect(
      parseWebviewToHost({
        type: "setAutoReindex",
        enabled: true,
        intervalMs: 5000,
      }).ok,
    ).toBe(true);
    expect(
      parseWebviewToHost({ type: "setAutoReindex", enabled: "yes" }).ok,
    ).toBe(false);
    expect(
      parseWebviewToHost({
        type: "setAutoReindex",
        enabled: true,
        intervalMs: "fast",
      }).ok,
    ).toBe(false);
  });

  it("validates boolean toggles", () => {
    expect(parseWebviewToHost({ type: "setCodeLens", enabled: false }).ok).toBe(
      true,
    );
    expect(parseWebviewToHost({ type: "setCodeLens" }).ok).toBe(false);
    expect(parseWebviewToHost({ type: "setLocalOnly", enabled: 1 }).ok).toBe(
      false,
    );
  });

  it("accepts messages with no payload", () => {
    expect(parseWebviewToHost({ type: "openInBrowser" }).ok).toBe(true);
    expect(parseWebviewToHost({ type: "clearData" }).ok).toBe(true);
    expect(parseWebviewToHost({ type: "runTests" }).ok).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "ready"],
    ["an array", []],
  ])("rejects %s", (_label, raw) => {
    expect(parseWebviewToHost(raw).ok).toBe(false);
  });
});
