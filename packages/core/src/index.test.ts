import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PRISM_API_LEVEL,
  PRISM_CORE_VERSION,
  Prism,
  STUB_CAPABILITIES,
} from "./index.js";

describe("@repo-prism/core exports", () => {
  it("re-exports the public façade", () => {
    expect(typeof Prism.create).toBe("function");
    expect(PRISM_CORE_VERSION).toBe("1.0.1");
    expect(PRISM_API_LEVEL).toBe(1);
    expect(STUB_CAPABILITIES.indexing).toBe(false);
  });

  // `prism doctor` reports PRISM_CORE_VERSION, so a drifting constant tells
  // every user the wrong version of a tool whose whole claim is accuracy.
  it("reports the version the package actually ships as", () => {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const { version } = manifest as { version: string };
    expect(PRISM_CORE_VERSION).toBe(version);
  });
});
