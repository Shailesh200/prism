import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkForUpdate,
  isLocalCheckout,
  isNewerVersion,
  UPDATE_CHECK_TTL_MS,
  updateNotice,
} from "./update-check.js";

const INSTALLED = "/usr/lib/node_modules/@repo-prism/mcp-server/dist/bin.js";

function home(): NodeJS.ProcessEnv {
  return { PRISM_HOME: mkdtempSync(join(tmpdir(), "prism-update-")) };
}

function registry(version: string, calls: { n: number }): typeof fetch {
  return (async () => {
    calls.n += 1;
    return new Response(JSON.stringify({ version }), { status: 200 });
  }) as typeof fetch;
}

describe("semver precedence", () => {
  it.each([
    ["2.0.1", "2.0.0", true],
    ["2.0.0", "2.0.0", false],
    ["2.0.0", "2.0.0-rc.1", true],
    ["2.0.0-rc.2", "2.0.0-rc.1", true],
    ["2.0.0-rc.10", "2.0.0-rc.9", true],
    ["2.0.0-beta", "2.0.0-alpha.1", true],
    ["2.0.0-alpha", "2.0.0-alpha.1", false],
    ["1.9.9", "2.0.0", false],
    ["not-a-version", "2.0.0", false],
  ])("%s newer than %s: %s", (latest, current, expected) => {
    expect(isNewerVersion(latest, current)).toBe(expected);
  });
});

describe("checkForUpdate", () => {
  it("never checks a local checkout", async () => {
    const calls = { n: 0 };
    const outcome = await checkForUpdate({
      currentVersion: "2.0.0",
      env: home(),
      entry: "/Users/me/Prism/packages/mcp-server/dist/bin.js",
      fetchImpl: registry("9.0.0", calls),
    });
    expect(outcome).toEqual({ kind: "skipped", reason: "local-checkout" });
    expect(calls.n).toBe(0);
    expect(isLocalCheckout(INSTALLED)).toBe(false);
  });

  it("reports an available update and caches the answer for 3 days", async () => {
    const env = home();
    const calls = { n: 0 };
    let now = Date.parse("2026-10-14T00:00:00Z");
    const input = {
      currentVersion: "2.0.0",
      env,
      entry: INSTALLED,
      now: () => now,
      fetchImpl: registry("2.1.0", calls),
    };
    const first = await checkForUpdate(input);
    expect(first).toEqual({
      kind: "available",
      latest: "2.1.0",
      cached: false,
    });
    expect(updateNotice(first)).toContain("run `prism upgrade`");
    now += UPDATE_CHECK_TTL_MS - 1;
    expect(await checkForUpdate(input)).toMatchObject({ cached: true });
    expect(calls.n).toBe(1);
    now += 2;
    await checkForUpdate(input);
    expect(calls.n).toBe(2);
    const cache = JSON.parse(
      readFileSync(join(env.PRISM_HOME!, "update.json"), "utf8"),
    );
    expect(cache.latest).toBe("2.1.0");
  });

  it("returns unknown with a reason when offline, and prints nothing", async () => {
    const outcome = await checkForUpdate({
      currentVersion: "2.0.0",
      env: home(),
      entry: INSTALLED,
      fetchImpl: (async () => {
        throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
      }) as typeof fetch,
    });
    expect(outcome).toEqual({
      kind: "unknown",
      reason: "getaddrinfo ENOTFOUND registry.npmjs.org",
    });
    expect(updateNotice(outcome)).toBeUndefined();
  });

  it("reports a corrupt cache as unknown instead of hiding it", async () => {
    const env = home();
    writeFileSync(join(env.PRISM_HOME!, "update.json"), "{not json");
    const outcome = await checkForUpdate({
      currentVersion: "2.0.0",
      env,
      entry: INSTALLED,
      fetchImpl: registry("2.0.0", { n: 0 }),
    });
    expect(outcome.kind).toBe("unknown");
  });

  it("is disabled by PRISM_SKIP_SELF_UPDATE=1", async () => {
    const outcome = await checkForUpdate({
      currentVersion: "2.0.0",
      env: { ...home(), PRISM_SKIP_SELF_UPDATE: "1" },
      entry: INSTALLED,
    });
    expect(outcome).toEqual({ kind: "skipped", reason: "disabled" });
  });
});
