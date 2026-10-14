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

  it("never matches two unreadable outputs", () => {
    const empty = failureSignature("something broke");
    expect(failureIsPreexisting(empty, empty)).toBe(false);
  });
});
