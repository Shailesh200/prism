import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeWorkerPrompt } from "./worker.js";
import {
  compactPackageRows,
  estimateTokens,
  formatPackageMap,
  loadWorkerOrientation,
  packagesFromManifests,
} from "./worker-orientation.js";
import type { JobRecord } from "./types.js";

function job(playbook = "ticket"): JobRecord {
  return {
    id: "J1",
    title: "Fix pulse clocks",
    playbook,
    prd: "Fix the waiting clock.",
    branch: "feat/j1",
    worktreePath: "/tmp/j1",
    source: "prism",
    status: "queued",
    lastStep: "",
    nextStep: "",
    waitingOn: "",
    createdAt: "t",
    updatedAt: "t",
  };
}

describe("compactPackageRows", () => {
  it("keeps id/name/rootDir and drops extra fields", () => {
    expect(
      compactPackageRows([
        {
          id: "dispatch",
          name: "@repo-prism/dispatch",
          rootDir: "packages/dispatch",
          domains: ["jobs"],
        },
      ]),
    ).toEqual([
      {
        id: "dispatch",
        name: "@repo-prism/dispatch",
        rootDir: "packages/dispatch",
      },
    ]);
  });
});

describe("worker orientation vs naive reads", () => {
  it("costs a fraction of walking source files", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-orient-"));
    await mkdir(join(root, "packages", "alpha"), { recursive: true });
    await mkdir(join(root, "packages", "beta", "src"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "mono" }),
    );
    await writeFile(
      join(root, "packages", "alpha", "package.json"),
      JSON.stringify({ name: "@app/alpha" }),
    );
    await writeFile(
      join(root, "packages", "beta", "package.json"),
      JSON.stringify({ name: "@app/beta" }),
    );
    await writeFile(
      join(root, "AGENTS.md"),
      "# Guide\nWork in packages/alpha.\n",
    );
    const blob = `${"export const x = 1;\n".repeat(80)}`;
    await writeFile(join(root, "packages", "beta", "src", "a.ts"), blob);
    await writeFile(join(root, "packages", "beta", "src", "b.ts"), blob);
    await writeFile(join(root, "packages", "beta", "src", "c.ts"), blob);

    const map = formatPackageMap(await packagesFromManifests(root));
    const orientation = await loadWorkerOrientation(root);
    const naiveBytes = blob.length * 3;
    const mapTokens = estimateTokens(map.length);
    const naiveTokens = estimateTokens(naiveBytes);
    const orientTokens = estimateTokens(orientation.length);

    expect(map).toContain("@app/alpha");
    expect(map).toContain("packages/alpha");
    expect(orientation).toContain("Repo guide:");
    expect(mapTokens).toBeLessThan(naiveTokens / 4);
    expect(orientTokens).toBeLessThan(naiveTokens / 2);
  });
});

describe("composeWorkerPrompt", () => {
  it("injects the package map for a repo job", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-prompt-"));
    await mkdir(join(root, "packages", "core"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "app" }),
    );
    await writeFile(
      join(root, "packages", "core", "package.json"),
      JSON.stringify({ name: "@app/core" }),
    );
    const text = await composeWorkerPrompt({
      job: job(),
      memories: [],
      workspaceRoot: root,
    });
    expect(text).toContain("Indexed packages");
    expect(text).toContain("@app/core");
    expect(text).toContain("semSearch");
  });

  it("skips the map on a Skills playbook", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-skill-orient-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "app" }),
    );
    const text = await composeWorkerPrompt({
      job: job("skill"),
      memories: [],
      workspaceRoot: root,
    });
    expect(text).not.toContain("Indexed packages");
  });
});
