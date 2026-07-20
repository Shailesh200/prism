import { describe, expect, it } from "vitest";
import { hashBufferSha256, looksBinary } from "./hash.js";

describe("hash", () => {
  it("produces stable sha256 hex digests", () => {
    const a = hashBufferSha256(Buffer.from("hello prism"));
    const b = hashBufferSha256(Buffer.from("hello prism"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(hashBufferSha256(Buffer.from("hello prism!"))).not.toBe(a);
  });

  it("detects NUL bytes as binary", () => {
    expect(looksBinary(Buffer.from("plain text"))).toBe(false);
    expect(looksBinary(Buffer.from("hel\0lo"))).toBe(true);
  });
});
