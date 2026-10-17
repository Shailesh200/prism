import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  runPromptHook,
  type PromptContext,
  type PromptFilesOutcome,
} from "./prompt-hook.js";

const here = dirname(fileURLToPath(import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const block: PromptContext = {
  text: "Prism · files for this task\n- src/a.ts: named in task",
  reason: "1 confident file",
  files: 1,
  shown: [{ path: "src/a.ts", hash: "abc" }],
  named: true,
  summary: ["1 file (a.ts)"],
};

const outcomes: Record<string, PromptFilesOutcome> = {
  ok: { kind: "ok", value: block },
  empty: {
    kind: "ok",
    value: { text: "", reason: "no confident file", files: 0, named: false },
  },
  busy: { kind: "unavailable", reason: "daemon did not answer in time" },
  language: {
    kind: "error",
    error: {
      code: "PRISM_UNSUPPORTED",
      message: "no language",
      details: { reason: "language" },
    } as never,
  },
};

const prompts = [
  "refactor chunk so it avoids the extra array copies",
  "fix src/a.ts so the test passes",
  "review this change with the QA lens",
  "how does src/a.ts reach src/b.ts?",
  "thanks!",
  "Architect: plan the new cache layer",
];

/** Two turns in one session, so the once-per-session marks are exercised. */
async function answers(run: typeof runPromptHook) {
  const out: unknown[] = [];
  for (const [name, outcome] of Object.entries(outcomes)) {
    const home = mkdtempSync(join(tmpdir(), "prism-prompt-contract-"));
    dirs.push(home);
    const env = { PRISM_HOME: home } as NodeJS.ProcessEnv;
    for (const prompt of prompts) {
      for (const turn of [1, 2]) {
        out.push([
          name,
          prompt,
          turn,
          await run(
            { prompt, session_id: `s-${name}` },
            {
              root: home,
              env,
              limitMs: 10_000,
              log: () => undefined,
              files: { via: "daemon", call: async () => outcome },
            },
          ),
        ]);
      }
    }
  }
  return out;
}

describe("prompt-hook.mjs contract", () => {
  it("answers exactly like @repo-prism/shared runPromptHook", async () => {
    const hook = (await import(
      pathToFileURL(
        join(here, "..", "..", "plugin", "hooks", "prompt-hook.mjs"),
      ).href
    )) as { runPromptHook: typeof runPromptHook };
    const bundled = await answers(hook.runPromptHook);
    expect(bundled).toEqual(await answers(runPromptHook));
    // The run said something real: a lens, a block and the language note.
    const text = JSON.stringify(bundled);
    expect(text).toContain("Lens: Dev");
    expect(text).toContain("Prism · files for this task");
    expect(text).toContain("not supported in 2.0");
  });
});
