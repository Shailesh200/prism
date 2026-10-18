import { describe, expect, it } from "vitest";
import {
  collectPublishTimes,
  formatPublished,
  publishedTimes,
  registryTimeUrl,
} from "./release-times";

describe("publish times", () => {
  it("prefers the current package and skips registry bookkeeping", () => {
    const times = collectPublishTimes([
      {
        created: "2026-10-01T00:00:00.000Z",
        modified: "2026-10-18T18:26:46.703Z",
        "2.0.2": "2026-10-18T18:26:46.703Z",
      },
      { "2.0.2": "2026-10-18T18:26:40.072Z", "1.12.0": "not-a-date" },
      { "1.12.0": "2026-09-18T21:07:51.090Z" },
    ]);
    expect(times["2.0.2"]).toBe("2026-10-18T18:26:46.703Z");
    expect(times["1.12.0"]).toBe("2026-09-18T21:07:51.090Z");
    expect(times.created).toBeUndefined();
    expect(times.modified).toBeUndefined();
  });

  it("prints the date and time in UTC", () => {
    expect(formatPublished("2026-10-18T18:26:46.703Z")).toBe(
      "18 Oct 2026, 18:26 UTC",
    );
    expect(formatPublished("nope")).toBe("");
  });

  it("reads each package's time map and ignores a package that fails", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      seen.push(href);
      if (href === registryTimeUrl("@prismapp/cli")) {
        return new Response(
          JSON.stringify({ time: { "2.0.2": "2026-10-18T18:26:46.703Z" } }),
          { status: 200 },
        );
      }
      if (href === registryTimeUrl("@repo-prism/mcp-server")) {
        throw new Error("offline");
      }
      return new Response("no", { status: 404 });
    }) as typeof fetch;
    await expect(publishedTimes(fetchImpl)).resolves.toEqual({
      "2.0.2": "2026-10-18T18:26:46.703Z",
    });
    expect(seen).toEqual([
      registryTimeUrl("@prismapp/cli"),
      registryTimeUrl("@repo-prism/mcp-server"),
      registryTimeUrl("@repo-prism/cli"),
    ]);
  });
});
