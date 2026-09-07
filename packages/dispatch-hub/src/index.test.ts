import { describe, expect, it } from "vitest";
import * as hub from "./index.js";

describe("dispatch-hub public entry", () => {
  it("does not load the statusline CLI through the package root", () => {
    expect("buildStatusline" in hub).toBe(false);
    expect("ensureHub" in hub).toBe(true);
    expect("readHubRecord" in hub).toBe(true);
  });
});
