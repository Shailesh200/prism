import { describe, expect, it } from "vitest";
import robots from "../app/robots";

describe("admin surface hygiene", () => {
  it("disallows /admin in robots.txt", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallow = rules.flatMap((r) => {
      const d = r?.disallow;
      if (!d) return [];
      return Array.isArray(d) ? d : [d];
    });
    expect(disallow.some((d) => String(d).startsWith("/admin"))).toBe(true);
  });
});
