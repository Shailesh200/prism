import { describe, expect, it } from "vitest";
import {
  BUILTIN_IGNORE_PATTERNS,
  HASH_ALGO,
  inventoryWorkspace,
  resolveWorkspaceRoot,
  runIndexJob,
  snapshotToSummary,
} from "./index.js";

describe("@prism/indexer exports", () => {
  it("exposes inventory + index job APIs", () => {
    expect(HASH_ALGO).toBe("sha256");
    expect(BUILTIN_IGNORE_PATTERNS).toContain("node_modules/");
    expect(typeof inventoryWorkspace).toBe("function");
    expect(typeof resolveWorkspaceRoot).toBe("function");
    expect(typeof runIndexJob).toBe("function");
    expect(typeof snapshotToSummary).toBe("function");
  });
});
