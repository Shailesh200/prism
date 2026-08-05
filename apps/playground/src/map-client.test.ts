import { describe, expect, it } from "vitest";
import { APP_NAME } from "./index.js";

describe("@repo-prism/playground", () => {
  it("exports app name", () => {
    expect(APP_NAME).toBe("@repo-prism/playground");
  });
});
