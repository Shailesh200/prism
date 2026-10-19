import { checksYielding, setChecksYield } from "@repo-prism/checks";
import { afterEach, describe, expect, it } from "vitest";
import { agentBusy, daemonRoutes } from "./daemon.js";

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
});
