import { describe, expect, it } from "vitest";
import {
  PACKAGE_NAME,
  createGraphStore,
  layoutGraph,
  nodesFromIndexSnapshot,
} from "./index.js";

describe("@repo-prism/graph-engine exports", () => {
  it("exposes store factories", () => {
    expect(PACKAGE_NAME).toBe("@repo-prism/graph-engine");
    expect(typeof createGraphStore).toBe("function");
    expect(typeof layoutGraph).toBe("function");
    expect(typeof nodesFromIndexSnapshot).toBe("function");
  });
});
