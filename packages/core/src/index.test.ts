import { describe, expect, it } from "vitest";
import {
  PRISM_API_LEVEL,
  PRISM_CORE_VERSION,
  Prism,
  STUB_CAPABILITIES,
} from "./index.js";

describe("@prism/core exports", () => {
  it("re-exports the public façade", () => {
    expect(typeof Prism.create).toBe("function");
    expect(PRISM_CORE_VERSION).toBe("0.1.0");
    expect(PRISM_API_LEVEL).toBe(1);
    expect(STUB_CAPABILITIES.indexing).toBe(false);
  });
});
