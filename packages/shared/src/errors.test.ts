import { describe, expect, it } from "vitest";
import { PrismErrorCode, isPrismError, prismError } from "./errors.js";

describe("PrismError", () => {
  it("creates without details", () => {
    const e = prismError(PrismErrorCode.NOT_FOUND, "missing");
    expect(e).toEqual({ code: PrismErrorCode.NOT_FOUND, message: "missing" });
    expect("details" in e).toBe(false);
  });

  it("creates with details", () => {
    const e = prismError(PrismErrorCode.VALIDATION, "bad", { field: "path" });
    expect(e.details).toEqual({ field: "path" });
  });

  it("isPrismError", () => {
    expect(isPrismError(prismError(PrismErrorCode.UNKNOWN, "x"))).toBe(true);
    expect(isPrismError({ code: "X", message: "y" })).toBe(true);
    expect(isPrismError(null)).toBe(false);
    expect(isPrismError({ code: 1, message: "y" })).toBe(false);
  });
});
