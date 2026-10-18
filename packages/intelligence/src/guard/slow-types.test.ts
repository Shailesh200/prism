import { describe, expect, it } from "vitest";
import {
  isSlowTypeCandidate,
  newSlowTypeExports,
  publishesToJsr,
  slowTypeExports,
} from "./slow-types.js";

// hono src/utils/url.ts around 6a0607a9 (B3): the change exported tryDecodeURI.
const HONO_BEFORE = `export const tryDecode = (str: string, decoder: Decoder): string => {
  return str
}
const tryDecodeURI = (str: string) => tryDecode(str, decodeURI)
`;
const HONO_AFTER = HONO_BEFORE.replace(
  "const tryDecodeURI",
  "export const tryDecodeURI",
);
const HONO_FIXED = HONO_AFTER.replace(
  "(str: string) => tryDecode(str, decodeURI)",
  "(str: string): string => tryDecode(str, decodeURI)",
);

describe("JSR slow types (round 5)", () => {
  it("catches hono 6a0607a9: a newly exported function with no return type", () => {
    expect(newSlowTypeExports(HONO_AFTER, HONO_BEFORE)).toEqual([
      "tryDecodeURI",
    ]);
    expect(newSlowTypeExports(HONO_FIXED, HONO_BEFORE)).toEqual([]);
  });

  it("an export that was already slow at HEAD is not this change's", () => {
    expect(newSlowTypeExports(HONO_AFTER, HONO_AFTER)).toEqual([]);
    expect(newSlowTypeExports(HONO_AFTER, null)).toEqual(["tryDecodeURI"]);
  });

  it("reads annotated forms as typed, including nested parentheses and generics", () => {
    const src = `
export const runWithRenderContext = <T>(callback: () => T, store?: S): T => {
  return callback()
}
export const typed: Handler = (c) => c.text("ok")
export function named<T extends Record<string, () => void>>(x: T): T { return x }
export async function load(url: string = "a)b"): Promise<string> { return url }
export const fn = function (a: number): number { return a }
export const value = compute(1, 2)
export const obj = { a: (x: number) => x }
`;
    expect(slowTypeExports(src)).toEqual([]);
  });

  it("finds each slow form", () => {
    const src = `
export function plain(a: string) { return a }
export default function dflt() { return 1 }
export async function* gen(a: number) { yield a }
export function over(a: string);
export const arrow = (a: number) => a + 1
export const asyncArrow = async (a: number) => a
export const bare = x => x
export const generic = <T,>(x: T) => x
export const literal = function (a: number) { return a }
`;
    expect(slowTypeExports(src).sort()).toEqual(
      [
        "arrow",
        "asyncArrow",
        "bare",
        "dflt",
        "gen",
        "generic",
        "literal",
        "over",
        "plain",
      ].sort(),
    );
  });

  it("only JSR packages, and only TypeScript sources", () => {
    const files: Record<string, string> = {};
    const read = (name: string) => files[name] ?? null;
    expect(publishesToJsr(read)).toBe(false);
    files["deno.json"] = `{ "tasks": {} }`;
    expect(publishesToJsr(read)).toBe(false);
    files["deno.json"] = `{ "name": "@x/y", "exports": "./mod.ts" }`;
    expect(publishesToJsr(read)).toBe(true);
    expect(publishesToJsr((n) => (n === "jsr.json" ? "{}" : null))).toBe(true);
    expect(isSlowTypeCandidate("src/a.ts")).toBe(true);
    expect(isSlowTypeCandidate("src/a.tsx")).toBe(true);
    expect(isSlowTypeCandidate("src/a.d.ts")).toBe(false);
    expect(isSlowTypeCandidate("src/a.js")).toBe(false);
  });
});
