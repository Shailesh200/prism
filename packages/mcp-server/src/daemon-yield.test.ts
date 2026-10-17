import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checksYielding,
  setChecksYield,
  trackCheckGroupForTest,
} from "@repo-prism/checks";
import { eventsPath } from "@repo-prism/shared/events";
import { afterEach, describe, expect, it } from "vitest";
import { agentBusy, daemonRoutes, wireYieldEvents } from "./daemon.js";

afterEach(async () => {
  await setChecksYield(false);
});

describe("daemon check yield (round 5, D)", () => {
  it("a prompt turns yield on as it arrives, before the index wait", async () => {
    const routes = await daemonRoutes();
    expect(checksYielding()).toBe(false);
    const parsed = routes.get("/v1/prompt")!.parseArgs({ prompt: "fix it" });
    expect(parsed.ok).toBe(true);
    expect(checksYielding()).toBe(true);
  });

  it("a bad prompt request changes nothing", async () => {
    const routes = await daemonRoutes();
    const parsed = routes.get("/v1/prompt")!.parseArgs({ prompt: 3 });
    expect(parsed.ok).toBe(false);
    expect(checksYielding()).toBe(false);
  });

  it("the stop turns it off", () => {
    agentBusy(true);
    expect(checksYielding()).toBe(true);
    agentBusy(false);
    expect(checksYielding()).toBe(false);
  });

  it("an incomplete sweep is written to events.jsonl as checks.yield_incomplete (Arc review)", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-yield-events-"));
    const saved = process.env.PRISM_HOME;
    process.env.PRISM_HOME = home;
    try {
      wireYieldEvents();
      trackCheckGroupForTest(4242, true);
      await setChecksYield(true, {
        exec: async () => null,
        platform: "darwin",
      });
      const lines = readFileSync(eventsPath(), "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(lines).toContainEqual(
        expect.objectContaining({
          event: "checks.yield_incomplete",
          outcome: "degraded",
          reason: "failed",
          detail: { platform: "darwin", pgid: 4242, passes: 1, mode: "yield" },
        }),
      );
    } finally {
      trackCheckGroupForTest(4242, false);
      if (saved === undefined) delete process.env.PRISM_HOME;
      else process.env.PRISM_HOME = saved;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
