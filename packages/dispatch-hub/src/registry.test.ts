import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRegistry, registerWorkspace, workspaceLabel } from "./registry.js";

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

  it("labels a path by its basename", () => {
    expect(workspaceLabel("/Users/me/Prism/")).toBe("Prism");
  });
});
