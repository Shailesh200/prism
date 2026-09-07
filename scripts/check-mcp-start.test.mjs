import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeResult } from "./check-mcp-start.mjs";

describe("initializeResult", () => {
  it("picks the initialize response out of mixed stdio frames", () => {
    const found = initializeResult([
      { jsonrpc: "2.0", method: "notifications/message", params: {} },
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          serverInfo: { name: "prism", version: "1.8.1" },
        },
      },
    ]);
    assert.equal(found?.result?.serverInfo?.name, "prism");
  });

  it("ignores an error frame for a different id", () => {
    assert.equal(
      initializeResult([{ jsonrpc: "2.0", id: 2, error: { code: -32000 } }]),
      undefined,
    );
  });
});
