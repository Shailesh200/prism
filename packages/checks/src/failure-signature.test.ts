import { describe, expect, it } from "vitest";
import { failureIsPreexisting, failureSignature } from "./failure-signature.js";

const VITEST_ONE = `
 ✓ src/ok.test.ts (3 tests) 4ms
 FAIL  src/cache.test.ts > lru > evicts the oldest entry
AssertionError: expected 2 to be 1
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 3 passed (4)
`;

const VITEST_TWO = `
 FAIL  src/cache.test.ts > lru > evicts the oldest entry
 FAIL  src/user.test.ts > fetchUser > caches
      Tests  2 failed | 2 passed (4)
`;

const TSC = `src/a.ts(3,4): error TS2322: Type 'string' is not assignable to type 'number'.
src/b.ts:10:2 - error TS2304: Cannot find name 'x'.
Found 2 errors in 2 files.`;

describe("failureSignature", () => {
  it("reads vitest failing files and the failed count", () => {
    expect(failureSignature(VITEST_ONE)).toEqual({
      files: ["src/cache.test.ts"],
      count: 1,
    });
  });

  it("reads tsc error files in both formats", () => {
    expect(failureSignature(TSC)).toEqual({
      files: ["src/a.ts", "src/b.ts"],
      count: 2,
    });
  });
});

describe("failureIsPreexisting", () => {
  it("is true when the same test fails before and after", () => {
    const sig = failureSignature(VITEST_ONE);
    expect(failureIsPreexisting(sig, sig)).toBe(true);
  });

  it("is false when the change breaks a second test", () => {
    expect(
      failureIsPreexisting(
        failureSignature(VITEST_ONE),
        failureSignature(VITEST_TWO),
      ),
    ).toBe(false);
  });

  it("is false when the same file has more type errors than before", () => {
    const before = { files: ["src/a.ts"], count: 1 };
    expect(
      failureIsPreexisting(before, { files: ["src/a.ts"], count: 3 }),
    ).toBe(false);
  });

  it("matches an unreadable output only when it is the same failure, timings aside", () => {
    // B3 replay: hono `lint` and an es-toolkit PnP error print no file, and
    // fail identically on the clean parent. That is already failing, not caused.
    const before = failureSignature("lint failed after 1.2s\nexit code 1");
    const same = failureSignature("lint failed after 3.4s\nexit code 1");
    const other = failureSignature("Cannot find module 'x'\nexit code 1");
    expect(failureIsPreexisting(before, same)).toBe(true);
    expect(failureIsPreexisting(before, other)).toBe(false);
  });

  it("never matches two empty outputs", () => {
    const empty = failureSignature("");
    expect(failureIsPreexisting(empty, empty)).toBe(false);
  });
});
