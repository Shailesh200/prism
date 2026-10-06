import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLAYGROUND_PORT,
  dashboardPortsToClose,
  findPlaygroundApp,
  isStrayPlaygroundListener,
  parseLsofListenFields,
  playgroundBindUrl,
  playgroundPort,
  playgroundUrl,
  playgroundViteEnabled,
  resolvePlaygroundNode,
} from "./playground.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("playground helpers", () => {
  it("defaults next to the Console, not Vite's 5173", () => {
    expect(PLAYGROUND_PORT).toBe(17331);
    expect(playgroundPort({})).toBe(17331);
    expect(playgroundPort({ PRISM_PLAYGROUND_PORT: "0" })).toBe(0);
    expect(playgroundPort({ PRISM_PLAYGROUND_PORT: "5199" })).toBe(5199);
    expect(playgroundUrl(17331)).toBe("http://prismhq.localhost:17331/");
    expect(playgroundBindUrl(17331)).toBe("http://127.0.0.1:17331/");
  });

  it("does not spawn Vite under vitest unless opted in", () => {
    expect(playgroundViteEnabled({ VITEST: "true" })).toBe(false);
    expect(playgroundViteEnabled({})).toBe(false);
    expect(
      playgroundViteEnabled({ VITEST: "true", PRISM_PLAYGROUND: "1" }),
    ).toBe(true);
  });

  it("finds apps/playground when this repo has one", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-pg-"));
    temps.push(root);
    expect(await findPlaygroundApp(root)).toBeUndefined();
    await mkdir(join(root, "apps", "playground"), { recursive: true });
    await writeFile(
      join(root, "apps", "playground", "package.json"),
      `${JSON.stringify({ name: "@repo-prism/playground" })}\n`,
    );
    expect(await findPlaygroundApp(root)).toBe(
      join(root, "apps", "playground"),
    );
  });

  it("keeps the live Dashboard port and closes every other listener", () => {
    expect(
      dashboardPortsToClose({
        canonical: 17331,
        recorded: 5173,
        canonicalLive: true,
      }),
    ).toEqual([5173]);
    expect(
      dashboardPortsToClose({
        canonical: 17331,
        recorded: 17331,
        canonicalLive: true,
      }),
    ).toEqual([]);
    expect(
      dashboardPortsToClose({
        canonical: 17331,
        recorded: 17332,
        canonicalLive: false,
      }).sort((a, b) => a - b),
    ).toEqual([17331, 17332]);
  });

  it("treats a playground Vite on another port as stray", () => {
    const rows = parseLsofListenFields(
      [
        "p42",
        "cnode",
        "n127.0.0.1:17332",
        "p99",
        "cnode",
        "n127.0.0.1:17331",
      ].join("\n"),
    );
    expect(rows).toEqual([
      { pid: 42, command: "node", port: 17332 },
      { pid: 99, command: "node", port: 17331 },
    ]);
    expect(
      isStrayPlaygroundListener(
        "node apps/playground/node_modules/vite/bin/vite.js --port 17332",
        17332,
        17331,
      ),
    ).toBe(true);
    expect(
      isStrayPlaygroundListener(
        "node apps/playground/node_modules/vite/bin/vite.js --port 17331",
        17331,
        17331,
      ),
    ).toBe(false);
  });

  it("uses PRISM_NODE when that binary exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-node-"));
    temps.push(root);
    const fake = join(root, "node");
    await writeFile(fake, "");
    expect(resolvePlaygroundNode({ env: { PRISM_NODE: fake } })).toBe(fake);
  });
});
