import { describe, expect, it } from "vitest";
import {
  GITHUB_CHANGELOG_URL,
  pageCount,
  pageHref,
  pageOf,
  readChangelogMarkdown,
  versionHref,
} from "./changelog-pages";

const versions = Array.from({ length: 23 }, (_, i) => `1.${22 - i}.0`);

describe("changelog pages", () => {
  it("splits versions ten to a page", () => {
    expect(pageCount(23)).toBe(3);
    expect(pageCount(0)).toBe(1);
  });

  it("puts page 1 at /changelog", () => {
    expect(pageHref(1)).toBe("/changelog");
    expect(pageHref(3)).toBe("/changelog/page/3");
  });

  it("links a version to the page that holds it", () => {
    expect(pageOf("1.22.0", versions)).toBe(1);
    expect(pageOf("1.12.0", versions)).toBe(2);
    expect(versionHref("1.0.0", versions)).toBe("/changelog/page/3#1.0.0");
    expect(versionHref("9.9.9", versions)).toBe("/changelog#9.9.9");
  });
});

describe("readChangelogMarkdown", () => {
  it("uses the changelog on GitHub main", async () => {
    const markdown = "# Changelog\n\n## 2.1.0 — Next\n\n- A note\n";
    const fetchImpl = (async (url: string | URL | Request) => {
      expect(String(url)).toBe(GITHUB_CHANGELOG_URL);
      return new Response(markdown, { status: 200 });
    }) as typeof fetch;
    await expect(readChangelogMarkdown(fetchImpl)).resolves.toBe(markdown);
  });

  it("falls back to the checkout when GitHub is unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const text = await readChangelogMarkdown(fetchImpl);
    expect(text).toContain("## 2.0.0");
  });
});
