import { describe, expect, it } from "vitest";
import { md5 } from "./md5.js";

describe("md5", () => {
  it("matches RFC 1321 test vectors", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5("a")).toBe("0cc175b9c0f1b6a831c399e269772661");
    expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
  });

  it("hashes a normalized email consistently", () => {
    const a = md5("dev@example.com");
    const b = md5("dev@example.com");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});
