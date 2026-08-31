import { describe, expect, it } from "vitest";
import { ensureHub } from "./ensure.js";

describe("ensureHub", () => {
  it("stays off when PRISM_HUB=0", async () => {
    const handle = await ensureHub({
      workspaceRoot: "/repos/app",
      env: { PRISM_HUB: "0" },
      spawnHub: () => {
        throw new Error("should not spawn");
      },
    });
    expect(handle.enabled).toBe(false);
    expect(handle.detail).toMatch(/off/i);
  });
});
