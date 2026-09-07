import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "./json-file.js";
import {
  dropMissingWorkspaces,
  loadRegistry,
  registerWorkspace,
  unregisterWorkspace,
  workspaceLabel,
} from "./registry.js";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("workspace registry", () => {
  it("adds and refreshes a workspace without duplicating it", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-reg-"));
    homes.push(home);
    const env = { PRISM_HUB_HOME: home };
    const first = await registerWorkspace("/repos/alpha", env, () => "t1");
    const second = await registerWorkspace("/repos/alpha", env, () => "t2");
    expect(second).toHaveLength(1);
    expect(second[0]?.lastSeenAt).toBe("t2");
    expect(first[0]?.label).toBe("alpha");
    const loaded = await loadRegistry(env);
    expect(loaded).toHaveLength(1);
  });

  it("removes a workspace from the Console without needing the folder", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-reg-"));
    homes.push(home);
    const env = { PRISM_HUB_HOME: home };
    await registerWorkspace("/repos/alpha", env, () => "t1");
    await registerWorkspace("/repos/beta", env, () => "t1");
    const next = await unregisterWorkspace("/repos/alpha/", env);
    expect(next.map((row) => row.label)).toEqual(["beta"]);
    expect(await loadRegistry(env)).toEqual(next);
  });

  it("labels a path by its basename", () => {
    expect(workspaceLabel("/Users/me/Prism/")).toBe("Prism");
  });

  it("does not register intelligence fixtures", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-reg-"));
    homes.push(home);
    const env = { PRISM_HUB_HOME: home };
    await registerWorkspace("/Users/me/Prism", env, () => "t1");
    const next = await registerWorkspace(
      "/Users/me/Prism/packages/intelligence/fixtures/m012-features",
      env,
      () => "t2",
    );
    expect(next.map((row) => row.label)).toEqual(["Prism"]);
  });

  it("drops nested folders when a parent checkout is registered", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-reg-"));
    homes.push(home);
    const env = { PRISM_HUB_HOME: home };
    await writeJsonFile(join(home, "registry.json"), {
      workspaces: [
        {
          path: "/Users/me/Prism/apps/website",
          label: "website",
          lastSeenAt: "t0",
        },
      ],
    });
    const next = await registerWorkspace("/Users/me/Prism", env, () => "t2");
    expect(next.map((row) => row.label)).toEqual(["Prism"]);
  });

  it("prunes fixtures that already sit in the registry", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-hub-reg-"));
    homes.push(home);
    const env = { PRISM_HUB_HOME: home };
    await writeJsonFile(join(home, "registry.json"), {
      workspaces: [
        {
          path: "/Users/me/Prism",
          label: "Prism",
          lastSeenAt: "t1",
        },
        {
          path: "/Users/me/Prism/packages/intelligence/fixtures/m012-features",
          label: "m012-features",
          lastSeenAt: "t1",
        },
        {
          path: "/Users/me/Prism/packages/intelligence/fixtures/m056-unresolved",
          label: "m056-unresolved",
          lastSeenAt: "t1",
        },
      ],
    });
    const kept = await dropMissingWorkspaces(async () => true, env);
    expect(kept.map((row) => row.label)).toEqual(["Prism"]);
    expect(await loadRegistry(env)).toEqual(kept);
  });
});
