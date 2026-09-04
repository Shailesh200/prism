import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  diskBudgetMessage,
  parseDarwinVmStat,
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

  it("counts reclaimable Darwin pages, not only free ones", () => {
    const fixture = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                4000.
Pages active:                            100000.
Pages inactive:                           50000.
Pages speculative:                         1000.
Pages wired down:                         80000.
Pages purgeable:                           2000.
`;
    // free+inactive+speculative+purgeable = 57000 * 16384 ≈ 933 MB
    const bytes = parseDarwinVmStat(fixture);
    expect(bytes).toBe(57_000 * 16_384);
    expect(ramBudgetMessage(bytes)).toBeUndefined();
  });

  it("still refuses when even reclaimable pages are scarce", () => {
    const fixture = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                 100.
Pages inactive:                             200.
Pages speculative:                            0.
Pages purgeable:                              0.
`;
    const bytes = parseDarwinVmStat(fixture)!;
    expect(bytes).toBeLessThan(400_000_000);
    expect(ramBudgetMessage(bytes)).toMatch(/low on memory/);
  });
});
