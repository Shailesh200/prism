import { describe, expect, it } from "vitest";
import { err, isErr, isOk, mapResult, ok, unwrap } from "./result.js";

describe("Result", () => {
  it("ok / err helpers", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err("x")).toEqual({ ok: false, error: "x" });
  });

  it("isOk / isErr", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
    expect(isErr(err("e"))).toBe(true);
  });

  it("mapResult", () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual({ ok: true, value: 4 });
    expect(mapResult(err("e"), (n: number) => n * 2)).toEqual({
      ok: false,
      error: "e",
    });
  });

  it("unwrap", () => {
    expect(unwrap(ok("a"))).toBe("a");
    expect(() => unwrap(err(new Error("boom")))).toThrow("boom");
  });
});
