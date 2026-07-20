import { describe, expect, it } from "vitest";
import {
  PACKAGE_NAME,
  createGraphStore,
  layoutGraph,
  nodesFromIndexSnapshot,
} from "./index.js";

describe("@prism/graph-engine exports", () => {
  it("exposes store factories", () => {
    expect(PACKAGE_NAME).toBe("@prism/graph-engine");
    expect(typeof createGraphStore).toBe("function");
    expect(typeof layoutGraph).toBe("function");
    expect(typeof nodesFromIndexSnapshot).toBe("function");
  });
});
