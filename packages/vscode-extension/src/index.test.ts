import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@prism/vscode-extension", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@prism/vscode-extension");
  });
});
