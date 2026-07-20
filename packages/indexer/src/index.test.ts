import { describe, expect, it } from "vitest";
import {
  BUILTIN_IGNORE_PATTERNS,
  HASH_ALGO,
  inventoryWorkspace,
  resolveWorkspaceRoot,
} from "./index.js";

describe("@prism/indexer exports", () => {
  it("exposes inventory API and sha256 algo constant", () => {
    expect(HASH_ALGO).toBe("sha256");
    expect(BUILTIN_IGNORE_PATTERNS).toContain("node_modules/");
    expect(typeof inventoryWorkspace).toBe("function");
    expect(typeof resolveWorkspaceRoot).toBe("function");
  });
});
