import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkForUpdate,
  latestUrl,
  npmRegistry,
  readCachedLatest,
  REGISTRY_URL,
  UPDATE_COMMAND,
  updateLine,
  updateNotice,
} from "./update-check.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function prismHome(cache?: string): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), "prism-update-"));
  dirs.push(dir);
  if (cache !== undefined) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "update.json"), cache);
  }
  return { PRISM_HOME: dir };
}

/** A registry stand-in answering `version`; records each URL asked. */
const fake = (asked: string[], version = "2.0.1") =>
  (async (url: string | URL | Request) => {
    asked.push(String(url));
    return new Response(JSON.stringify({ version }), { status: 200 });
  }) as typeof fetch;
const entry = "/usr/lib/node_modules/@repo-prism/cli/dist/bin.js";

describe("update notice (PR 10)", () => {
  it("names the real npm command (prism upgrade downloads nothing)", () => {
    expect(UPDATE_COMMAND).toBe("npm i -g @repo-prism/cli@latest");
    expect(updateLine("2.0.1")).toBe(
      "Prism 2.0.1 is out. To update, run: npm i -g @repo-prism/cli@latest",
    );
    expect(
      updateNotice({ kind: "available", latest: "2.0.1", cached: true }),
    ).toBe(
      "prism-mcp: Prism 2.0.1 is out. To update, run: npm i -g @repo-prism/cli@latest\n",
    );
    expect(
      updateNotice({ kind: "current", latest: "2.0.0", cached: true }),
    ).toBeUndefined();
  });

  it("readCachedLatest reads only the cache, of any age, and never throws", () => {
    const old = JSON.stringify({
      checkedAt: "2020-01-01T00:00:00Z",
      latest: "2.0.1",
    });
    expect(readCachedLatest("2.0.0", prismHome(old))).toBe("2.0.1");
    expect(readCachedLatest("2.0.1", prismHome(old))).toBeUndefined();
    expect(readCachedLatest("2.1.0", prismHome(old))).toBeUndefined();
    expect(readCachedLatest("2.0.0", prismHome())).toBeUndefined();
    expect(readCachedLatest("2.0.0", prismHome("not json"))).toBeUndefined();
    expect(
      readCachedLatest("2.0.0", prismHome('{"latest":7}')),
    ).toBeUndefined();
    expect(
      readCachedLatest("2.0.0", {
        ...prismHome(old),
        PRISM_SKIP_SELF_UPDATE: "1",
      }),
    ).toBeUndefined();
  });

  it("asks npm about @repo-prism/cli, the package the command installs (Arc review)", async () => {
    expect(REGISTRY_URL).toBe(
      "https://registry.npmjs.org/@repo-prism/cli/latest",
    );
    const asked: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      asked.push(String(url));
      return new Response(JSON.stringify({ version: "2.0.1" }), {
        status: 200,
      });
    }) as typeof fetch;
    const outcome = await checkForUpdate({
      currentVersion: "2.0.0",
      entry: "/usr/lib/node_modules/@repo-prism/cli/dist/bin.js",
      env: prismHome(),
      fetchImpl,
    });
    expect(asked).toEqual([
      "https://registry.npmjs.org/@repo-prism/cli/latest",
    ]);
    expect(outcome).toMatchObject({ kind: "available", latest: "2.0.1" });
    expect(UPDATE_COMMAND).toContain("@repo-prism/cli@");
  });

  describe("registry: npm's own config (Scout's RC testing)", () => {
    it("reads npm_config_registry in any case, lower-case first, else registry.npmjs.org", () => {
      expect(npmRegistry({})).toBe("https://registry.npmjs.org");
      expect(
        npmRegistry({ npm_config_registry: "http://127.0.0.1:4873/" }),
      ).toBe("http://127.0.0.1:4873");
      expect(npmRegistry({ NPM_CONFIG_REGISTRY: "http://fake.test" })).toBe(
        "http://fake.test",
      );
      expect(npmRegistry({ Npm_Config_Registry: "http://mixed.test" })).toBe(
        "http://mixed.test",
      );
      expect(
        npmRegistry({
          NPM_CONFIG_REGISTRY: "http://upper.test",
          npm_config_registry: "http://lower.test",
        }),
      ).toBe("http://lower.test");
      expect(npmRegistry({ npm_config_registry: "  " })).toBe(
        "https://registry.npmjs.org",
      );
      // No Prism-specific variable.
      expect(npmRegistry({ PRISM_REGISTRY: "http://nope.test" })).toBe(
        "https://registry.npmjs.org",
      );
      expect(latestUrl({ npm_config_registry: "http://127.0.0.1:4873/" })).toBe(
        "http://127.0.0.1:4873/@repo-prism/cli/latest",
      );
    });

    it("a fake registry's 2.0.1 is seen, and a cache from another registry is not reused", async () => {
      const home = mkdtempSync(join(tmpdir(), "prism-update-home-"));
      dirs.push(home);
      const env = { HOME: home, PRISM_HOME: join(home, ".prism") };
      const asked: string[] = [];
      // A fresh answer from the default registry: nothing newer.
      expect(
        await checkForUpdate({
          currentVersion: "2.0.0",
          entry,
          env,
          fetchImpl: fake(asked, "2.0.0"),
        }),
      ).toMatchObject({ kind: "current" });
      // Same day, pointed at a fake registry with 2.0.1: asked again, seen.
      const outcome = await checkForUpdate({
        currentVersion: "2.0.0",
        entry,
        env: { ...env, NPM_CONFIG_REGISTRY: "http://127.0.0.1:4873" },
        fetchImpl: fake(asked),
      });
      expect(outcome).toMatchObject({ kind: "available", latest: "2.0.1" });
      expect(asked).toEqual([
        "https://registry.npmjs.org/@repo-prism/cli/latest",
        "http://127.0.0.1:4873/@repo-prism/cli/latest",
      ]);
    });
  });
});
