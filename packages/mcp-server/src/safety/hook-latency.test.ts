/**
 * Plan P17 HOOK-P*: warm-daemon latency contracts (unit, no real daemon).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { readSessionStore } from "@repo-prism/shared/session-store";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTO_PREPARE_MS,
  STOP_BUDGET_MS,
  autoPrepare,
  stopHook,
} from "./hook-command.js";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0))
    rmSync(home, { recursive: true, force: true });
});

function homeEnv(): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "prism-hook-p-"));
  homes.push(home);
  return { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "1" };
}

describe("P17 hook latency budgets", () => {
  it("HOOK-P1 constants: prompt budget and ready wait are under 1 s", () => {
    expect(AUTO_PREPARE_MS).toBeLessThanOrEqual(1000);
    expect(AUTO_PREPARE_MS).toBe(900);
  });

  it("HOOK-P3 constants: stop budget is under 1 s", () => {
    expect(STOP_BUDGET_MS).toBeLessThanOrEqual(1000);
    expect(STOP_BUDGET_MS).toBe(900);
  });

  const context = (output: Record<string, unknown>) =>
    (output.hookSpecificOutput as { additionalContext?: string } | undefined)
      ?.additionalContext ?? "";

  it("HOOK-P2 deadline path drops the file block and still sends the lens", async () => {
    const env = homeEnv();
    const output = await autoPrepare(
      { prompt: "fix the login form validation" },
      {
        root: process.cwd(),
        env,
        daemon: async () => ({
          kind: "unavailable",
          reason: "daemon did not answer",
        }),
      },
    );
    expect(context(output)).toMatch(/^Lens: Dev/);
    expect(context(output)).not.toMatch(/files for this task/);
    expect(output.systemMessage).toBe(
      "Prism · Dev lens + files skipped (index busy)",
    );
    const events = readFileSync(join(env.PRISM_HOME!, "events.jsonl"), "utf8");
    expect(events).toMatch(/"event":"prompt\.daemon"/);
  });

  it("HOOK-P2 elapsed-over-budget path drops the block and keeps it out of session memory", async () => {
    const env = homeEnv();
    let clock = 1_000_000;
    const output = await autoPrepare(
      { prompt: "fix the login form validation", session_id: "late" },
      {
        root: process.cwd(),
        env,
        now: () => clock,
        daemon: async () => {
          clock += 2_000; // blow past the 900 ms budget during the call
          return {
            kind: "ok",
            value: {
              text: "Prism · files for this task:\n- src/a.ts",
              reason: "1 new file",
              files: 1,
              named: false,
              shown: [{ path: "src/a.ts", hash: "h" }],
            },
          };
        },
      },
    );
    expect(context(output)).not.toMatch(/files for this task/);
    expect(readSessionStore("late", env).sent["src/a.ts"]).toBeUndefined();
  });

  it("a delivered block goes into session memory, followed by the lens", async () => {
    const env = homeEnv();
    const output = await autoPrepare(
      { prompt: "fix the login form validation", session_id: "on-time" },
      {
        root: process.cwd(),
        env,
        daemon: async () => ({
          kind: "ok",
          value: {
            text: "Prism · files for this task:\n- src/a.ts",
            reason: "1 new file",
            files: 1,
            named: false,
            shown: [{ path: "src/a.ts", hash: "h" }],
            summary: ["1 file (a.ts)"],
          },
        }),
      },
    );
    expect(context(output)).toMatch(
      /^Prism · files for this task:[\s\S]*\nLens: Dev/,
    );
    expect(output.systemMessage).toBe("Prism · Dev lens + 1 file (a.ts)");
    expect(readSessionStore("on-time", env).sent["src/a.ts"]).toBeDefined();
  });

  it("a prompt naming its files marks the session lite", async () => {
    const env = homeEnv();
    await autoPrepare(
      {
        prompt: "fix src/a.ts so the login form validates",
        session_id: "lite",
      },
      {
        root: process.cwd(),
        env,
        daemon: async () => ({
          kind: "ok",
          value: {
            text: "Prism · files for this task:\n- src/a.ts",
            reason: "prompt names its files",
            files: 1,
            named: true,
            shown: [{ path: "src/a.ts", hash: "h" }],
          },
        }),
      },
    );
    const lite = join(
      workspacePrismDir(process.cwd(), env),
      "hooks",
      "lite.json",
    );
    expect(JSON.parse(readFileSync(lite, "utf8"))).toEqual(["lite"]);
  });

  it("no time left after start-up: the lens goes out, the daemon is not asked", async () => {
    const env = homeEnv();
    let asked = 0;
    const output = await autoPrepare(
      { prompt: "fix the login form validation" },
      {
        root: process.cwd(),
        env,
        startedAt: Date.now() - 880,
        daemon: async () => {
          asked += 1;
          return { kind: "unavailable", reason: "not reached" };
        },
      },
    );
    expect(asked).toBe(0);
    expect(context(output)).toMatch(/^Lens: Dev/);
  });

  it("a review gets its lens without waiting on the daemon", async () => {
    const env = homeEnv();
    let asked = 0;
    const output = await autoPrepare(
      { prompt: "review the last commit" },
      {
        root: process.cwd(),
        env,
        daemon: async () => {
          asked += 1;
          return { kind: "unavailable", reason: "busy re-indexing" };
        },
      },
    );
    expect(asked).toBe(0);
    expect(context(output)).toMatch(/^Lens: Architect/);
  });

  it("the lens comes back when a follow-up widens the scope; a bare change says nothing to add", async () => {
    const env = homeEnv();
    const ask = (prompt: string) =>
      autoPrepare(
        { prompt, session_id: "widen" },
        {
          root: process.cwd(),
          env,
          daemon: async () => ({
            kind: "ok",
            value: { text: null, reason: "x", files: 0, named: false },
          }),
        },
      );
    expect(context(await ask("fix the login form validation"))).toMatch(
      /^Lens: Dev/,
    );
    const again = await ask("fix the signup form validation too");
    expect(context(again)).toBe("");
    expect(again.systemMessage).toBe("Prism · nothing to add");
    const wider = await ask("fix the form validation everywhere");
    expect(context(wider)).toMatch(/^Lens: Dev/);
    expect(wider.systemMessage).toBe("Prism · Dev lens");
  });

  it("HOOK-P4 daemon crash on stop: degrade with an event, no hang", async () => {
    const env = homeEnv();
    const t0 = Date.now();
    const out = await stopHook(
      { session_id: "hook-p4" },
      {
        root: process.cwd(),
        env,
        daemon: async () => ({
          kind: "unavailable",
          reason: "daemon crashed",
        }),
      },
    );
    expect(out).toEqual({});
    expect(Date.now() - t0).toBeLessThan(500);
    const events = readFileSync(join(env.PRISM_HOME!, "events.jsonl"), "utf8");
    expect(events).toMatch(/"event":"receipt\.degraded"/);
    expect(events).toMatch(/daemon crashed/);
  });

  it("in-process prepare only when the daemon is off", async () => {
    const env = homeEnv();
    // daemon null → in-process; use a non-change skip to avoid indexing the
    // whole Prism tree under process.cwd().
    const output = await autoPrepare(
      { prompt: "what is the capital of France?" },
      { root: process.cwd(), env, daemon: null },
    );
    expect(output).toEqual({});
  });
});
