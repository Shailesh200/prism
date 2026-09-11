import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultPlaygroundRoot,
  playgroundPresets,
  playgroundSurfaces,
  saveSelectedRoot,
} from "./hub-registry.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("Spectrum default root", () => {
  it("follows the Dispatch-selected checkout, not the Prism monorepo", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-spectrum-"));
    temps.push(home);
    await writeFile(
      join(home, "registry.json"),
      `${JSON.stringify({
        selectedPath: "/Users/me/website",
        workspaces: [
          { path: "/Users/me/Prism", label: "Prism" },
          { path: "/Users/me/website", label: "website" },
        ],
      })}\n`,
    );
    const env = {
      PRISM_HUB_HOME: home,
      PRISM_PLAYGROUND_ROOT: "/Users/me/Prism",
    };
    expect(defaultPlaygroundRoot(env)).toBe("/Users/me/website");
    expect(playgroundPresets(env).presets.map((row) => row.label)).toEqual([
      "Prism",
      "website",
    ]);
  });

  it("falls back to PRISM_PLAYGROUND_ROOT when the hub has no workspaces", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-empty-"));
    temps.push(home);
    expect(
      defaultPlaygroundRoot({
        PRISM_HUB_HOME: home,
        PRISM_PLAYGROUND_ROOT: "/tmp/smoke",
      }),
    ).toBe("/tmp/smoke");
  });

  it("does not invent the Prism checkout when nothing is selected", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-none-"));
    temps.push(home);
    expect(defaultPlaygroundRoot({ PRISM_HUB_HOME: home })).toBeUndefined();
    expect(playgroundPresets({ PRISM_HUB_HOME: home }).defaultRoot).toBe("");
  });

  it("writes selectedPath so Dispatch and Spectrum stay in parity", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-write-"));
    temps.push(home);
    const env = { PRISM_HUB_HOME: home };
    expect(saveSelectedRoot("/Users/me/website", env)).toBe(
      "/Users/me/website",
    );
    expect(defaultPlaygroundRoot(env)).toBe("/Users/me/website");
    expect(playgroundPresets(env).presets[0]?.label).toBe("website");
  });
});

describe("playgroundSurfaces", () => {
  it("reports Dispatch down when the hub is not answering", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-surfaces-"));
    temps.push(home);
    await writeFile(
      join(home, "hub.json"),
      `${JSON.stringify({ port: 9, token: "t" })}\n`,
    );
    const status = await playgroundSurfaces(
      { PRISM_HUB_HOME: home, PRISM_PLAYGROUND_PORT: "17331" },
      async () => {
        throw new Error("offline");
      },
    );
    expect(status.spectrum.live).toBe(true);
    expect(status.dispatch.live).toBe(false);
    expect(status.dispatch.url).toContain("token=t");
  });

  it("reports Dispatch awake when healthz is ok and not asleep", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-surfaces-up-"));
    temps.push(home);
    await writeFile(
      join(home, "hub.json"),
      `${JSON.stringify({ port: 17330, token: "t" })}\n`,
    );
    const status = await playgroundSurfaces(
      { PRISM_HUB_HOME: home },
      async () =>
        new Response(JSON.stringify({ ok: true, asleep: false }), {
          status: 200,
        }),
    );
    expect(status.dispatch.live).toBe(true);
  });
});
