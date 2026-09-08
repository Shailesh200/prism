import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  asleepPageHtml,
  isInProcessJobStatus,
  isPrismAsleep,
  isPrismAsleepSync,
  putPrismToSleep,
  wakePrism,
} from "./sleep.js";

let home = "";

afterEach(async () => {
  if (home) await rm(home, { recursive: true, force: true });
  home = "";
});

describe("Prism sleep state", () => {
  it("is awake until sleep.json says otherwise", async () => {
    home = await mkdtemp(join(tmpdir(), "prism-sleep-"));
    const env = { PRISM_HUB_HOME: home };
    expect(await isPrismAsleep(env)).toBe(false);
    expect(isPrismAsleepSync(env)).toBe(false);

    await putPrismToSleep(env, [
      { workspaceRoot: "/tmp/repo", jobId: "fix-auth" },
    ]);
    expect(await isPrismAsleep(env)).toBe(true);
    expect(isPrismAsleepSync(env)).toBe(true);

    const paused = await wakePrism(env);
    expect(paused).toEqual([{ workspaceRoot: "/tmp/repo", jobId: "fix-auth" }]);
    expect(await isPrismAsleep(env)).toBe(false);
    expect(isPrismAsleepSync(env)).toBe(false);
  });

  it("tells the browser how to wake Prism", () => {
    const html = asleepPageHtml();
    expect(html).toContain("Prism is down");
    expect(html).toContain("prism wake");
    expect(html).toContain("#00c2c2");
  });

  it("treats only live workers as in-process", () => {
    expect(isInProcessJobStatus("queued")).toBe(false);
    expect(isInProcessJobStatus("paused")).toBe(false);
    expect(isInProcessJobStatus("running")).toBe(true);
    expect(isInProcessJobStatus("booting")).toBe(true);
    expect(isInProcessJobStatus("ready")).toBe(true);
  });
});
