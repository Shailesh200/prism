import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { maybeSelfUpdate } from "./self-update.js";

const ENTRY = "/usr/lib/node_modules/@prismapp/mcp-server/dist/bin.js";

function home(): NodeJS.ProcessEnv {
  return { PRISM_HOME: mkdtempSync(join(tmpdir(), "prism-self-update-")) };
}

function registry(version: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ version }), { status: 200 })) as typeof fetch;
}

describe("maybeSelfUpdate", () => {
  it("installs the newer CLI and relaunches that build", async () => {
    const calls: {
      cmd: string;
      args: readonly string[];
      env?: NodeJS.ProcessEnv;
    }[] = [];
    const result = await maybeSelfUpdate({
      currentVersion: "2.0.2",
      env: home(),
      entry: ENTRY,
      execPath: "/usr/bin/node",
      argv: [ENTRY],
      fetchImpl: registry("2.1.0"),
      spawnImpl: ((cmd, args, opts) => {
        calls.push({
          cmd: String(cmd),
          args: args ?? [],
          ...(opts?.env ? { env: opts.env } : {}),
        });
        return { status: 0 } as ReturnType<typeof spawnSync>;
      }) as typeof spawnSync,
    });
    expect(calls[0]?.cmd).toMatch(/npm$/);
    expect(calls[0]?.args).toEqual(["install", "-g", "@prismapp/cli@2.1.0"]);
    expect(calls[1]?.cmd).toBe("/usr/bin/node");
    expect(calls[1]?.env?.PRISM_SELF_UPDATE_DONE).toBe("1");
    expect(result).toEqual({ kind: "relaunch", status: 0 });
  });

  it("does not retry an install that already failed for this version", async () => {
    const env = home();
    let now = Date.parse("2026-10-14T00:00:00Z");
    let installs = 0;
    const spawnImpl = ((cmd: string) => {
      if (String(cmd).endsWith("npm") || String(cmd).endsWith("npm.cmd")) {
        installs += 1;
        return { status: 1 };
      }
      return { status: 0 };
    }) as typeof spawnSync;
    const input = {
      currentVersion: "2.0.2",
      env,
      entry: ENTRY,
      execPath: "/usr/bin/node",
      argv: [ENTRY],
      now: () => now,
      fetchImpl: registry("2.1.0"),
      spawnImpl,
    };
    expect((await maybeSelfUpdate(input)).kind).toBe("continue");
    expect(installs).toBe(1);
    now += 60_000;
    expect((await maybeSelfUpdate(input)).kind).toBe("continue");
    expect(installs).toBe(1);
  });
});
