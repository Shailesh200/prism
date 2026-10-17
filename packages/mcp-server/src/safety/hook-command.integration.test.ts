import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import { stopHook } from "./hook-command.js";

const fixtures: Fixture[] = [];
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
  for (const home of homes.splice(0))
    rmSync(home, { recursive: true, force: true });
});

async function edited(): Promise<{ fixture: Fixture; env: NodeJS.ProcessEnv }> {
  const fixture = await createFixture({ name: "stop-hook" });
  fixtures.push(fixture);
  await fixture.write("package.json", JSON.stringify({ name: "stop" }));
  await fixture.write("src/a.ts", "export const a = 1;\n");
  fixture.commit("initial");
  await fixture.write("src/a.ts", "export const a = 2;\n");
  const home = mkdtempSync(join(tmpdir(), "prism-stop-home-"));
  homes.push(home);
  return {
    fixture,
    env: { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "0" },
  };
}

describe("stop hook (plan §5.7, R-C4)", () => {
  it("builds the receipt in-process when no daemon answers", async () => {
    const { fixture, env } = await edited();
    const out = (await stopHook(
      { session_id: "s-1" },
      { root: fixture.root, env, daemon: null },
    )) as { systemMessage?: string; hookSpecificOutput?: unknown };
    const text = out.systemMessage ?? "";
    // The receipt is shown to the user; nothing goes back to the agent.
    expect(out.hookSpecificOutput).toBeUndefined();
    expect(text).toMatch(/^Prism · NOT PROVEN \(untested\)/);
    expect(text).toMatch(/Prism receipt: changed 1 file/);
    // P11 NP-1: an untested source names its cheapest runnable proof.
    expect(text).toMatch(/Prove it\s+run: .+ → proves src\/a\.ts/);
  });

  it("a daemon error reaches the event log, never the agent", async () => {
    const { fixture, env } = await edited();
    const out = await stopHook(
      {},
      {
        root: fixture.root,
        env,
        daemon: async () => ({
          kind: "error",
          error: {
            code: "UNKNOWN",
            message: "ENOENT: stack trace here",
          } as never,
        }),
      },
    );
    expect(out).toEqual({});
    const events = readFileSync(
      join(env.PRISM_HOME ?? "", "events.jsonl"),
      "utf8",
    );
    expect(events).toMatch(/"event":"receipt\.error"/);
  });

  it("uses the daemon's receipt when one answers", async () => {
    const { fixture, env } = await edited();
    const out = (await stopHook(
      {},
      {
        root: fixture.root,
        env,
        daemon: async () => ({
          kind: "ok",
          value: {
            id: "abcdef0123456789",
            diffHash: "h",
            generatedAt: new Date().toISOString(),
            verdict: "not_proven",
            reason: "still_running",
            checksState: "pending",
            touched: {
              files: ["src/a.ts"],
              totalFiles: 1,
              dependents: 0,
              truncated: false,
            },
            checks: [],
            testMode: "skipped",
            testFiles: ["src/a.test.ts"],
            notProven: [],
            unsupported: [],
            flags: [],
            mode: "daemon",
            durationMs: 5,
          },
        }),
      },
    )) as {
      decision?: string;
      systemMessage?: string;
      hookSpecificOutput?: unknown;
    };
    expect(out.decision).toBeUndefined();
    expect(out.hookSpecificOutput).toBeUndefined();
    expect(out.systemMessage).toMatch(/NOT PROVEN \(still_running\)/);
  });
});
