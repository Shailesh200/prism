import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  diskBudgetMessage,
  ramBudgetMessage,
  workerChildEnv,
} from "./worker-budget.js";

describe("worker budget", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("does not inherit a heap cap onto the Cursor agent", () => {
    expect(
      workerChildEnv({ NODE_OPTIONS: "--max-old-space-size=512 --trace-gc" })
        .NODE_OPTIONS,
    ).toBe("--trace-gc");
    expect(workerChildEnv({ PATH: "/bin" }).NODE_OPTIONS).toBeUndefined();
  });

  it("warns when free space is below the requested floor", async () => {
    root = await mkdtemp(join(tmpdir(), "prism-disk-"));
    const message = await diskBudgetMessage(root, Number.MAX_SAFE_INTEGER);
    expect(message).toMatch(/low on disk/);
    expect(await diskBudgetMessage(root, 1)).toBeUndefined();
  });

  it("warns when free RAM is below the floor", () => {
    expect(ramBudgetMessage(1_000)).toMatch(/low on memory/);
    expect(ramBudgetMessage(2_000_000_000)).toBeUndefined();
  });
});
