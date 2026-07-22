import { describe, expect, it } from "vitest";
import { BRIDGE_PORT } from "./browser-bridge.js";

describe("browser-bridge", () => {
  it("binds a fixed loopback port", () => {
    expect(BRIDGE_PORT).toBe(17321);
  });
});
