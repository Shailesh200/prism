import { describe, expect, it } from "vitest";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { PrismErrorCode, prismError } from "@repo-prism/shared";
import { toMcpError, toMcpErrorFromThrown } from "./errors.js";

describe("PrismError → MCP error (M-026)", () => {
  it("maps every Prism error code without falling through to a default", () => {
    // The point of the table is that adding a PrismErrorCode forces a decision
    // here rather than silently becoming an internal error.
    for (const code of Object.values(PrismErrorCode)) {
      const mapped = toMcpError(prismError(code, "something happened"));
      expect(mapped, code).toBeInstanceOf(McpError);
      expect(mapped.code, code).not.toBeUndefined();
    }
  });

  it("classifies caller mistakes as InvalidParams so agents stop retrying", () => {
    for (const code of [
      PrismErrorCode.VALIDATION,
      PrismErrorCode.NOT_FOUND,
      PrismErrorCode.INVALID_PATH,
      PrismErrorCode.INVALID_ID,
    ]) {
      expect(toMcpError(prismError(code, "bad input")).code, code).toBe(
        ErrorCode.InvalidParams,
      );
    }
  });

  it("classifies our own failures as InternalError so retrying stays sensible", () => {
    for (const code of [
      PrismErrorCode.INDEX_FAILED,
      PrismErrorCode.IO_ERROR,
      PrismErrorCode.GRAPH_ERROR,
      PrismErrorCode.ANALYZER_FAILED,
    ]) {
      expect(toMcpError(prismError(code, "we failed")).code, code).toBe(
        ErrorCode.InternalError,
      );
    }
  });

  it("keeps the Prism code readable in the message", () => {
    // MCP's error space is narrower than Prism's, so the specific code has to
    // survive somewhere an agent can still branch on it.
    const mapped = toMcpError(
      prismError(PrismErrorCode.VALIDATION, "bad input"),
    );
    expect(mapped.message).toContain("PRISM_VALIDATION");
    expect(mapped.message).toContain("bad input");
  });

  it("rewrites INDEX_REQUIRED into an actionable retry hint (M-058 / P-C7)", () => {
    const mapped = toMcpError(
      prismError(PrismErrorCode.INDEX_REQUIRED, "index first"),
    );
    expect(mapped.message).toContain("PRISM_INDEX_REQUIRED");
    expect(mapped.message).toContain(
      "Index not ready yet — retry in a few seconds",
    );
    expect(mapped.message).not.toContain("index first");
  });

  it("carries details through for diagnosis", () => {
    const mapped = toMcpError(
      prismError(PrismErrorCode.IO_ERROR, "disk", { path: "/tmp/x" }),
    );
    expect(mapped.data).toEqual({ path: "/tmp/x" });
  });

  describe("thrown values", () => {
    it("passes an McpError through unchanged", () => {
      const original = new McpError(ErrorCode.InvalidParams, "nope");
      expect(toMcpErrorFromThrown(original)).toBe(original);
    });

    it("wraps an Error without leaking a stack trace", () => {
      const mapped = toMcpErrorFromThrown(new Error("native boom"));
      expect(mapped.code).toBe(ErrorCode.InternalError);
      expect(mapped.message).toContain("native boom");
      expect(mapped.message).not.toContain("at ");
    });

    it("wraps a non-Error throw", () => {
      expect(toMcpErrorFromThrown("just a string").message).toContain(
        "just a string",
      );
    });
  });
});
