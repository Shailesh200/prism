import { describe, expect, it } from "vitest";
import {
  HUB_ERROR,
  apiErrorMessage,
  isMachineErrorLabel,
  publicCaughtError,
} from "./api-errors.js";

describe("apiErrorMessage", () => {
  it("keeps a sentence from the hub", () => {
    expect(
      apiErrorMessage({ error: "No worker configured." }, "HTTP 500"),
    ).toBe("No worker configured.");
  });

  it("falls back when the body is a leftover machine label", () => {
    expect(
      apiErrorMessage({ error: "unauthorized" }, HUB_ERROR.unauthorized),
    ).toBe(HUB_ERROR.unauthorized);
    expect(
      apiErrorMessage({ error: "workspace and title required" }, "fallback"),
    ).toBe("fallback");
    expect(isMachineErrorLabel("not found")).toBe(true);
    expect(isMachineErrorLabel("No worker configured.")).toBe(false);
  });
});

describe("publicCaughtError", () => {
  it("turns a raw throw into a sentence and drops stacks", () => {
    expect(
      publicCaughtError(new Error("spawn failed\n    at Object.<anonymous>")),
    ).toBe("Spawn failed.");
    expect(publicCaughtError(new Error("unauthorized"))).toBe(
      HUB_ERROR.generic,
    );
    expect(publicCaughtError("already a sentence.")).toBe(
      "already a sentence.",
    );
  });
});
