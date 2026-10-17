/**
 * The hook runs `packages/plugin/hooks/hook-config.mjs`, a bundle of this
 * module. A stale bundle would upgrade configs to an old plan: hold the two
 * to the same answers (regenerate with `bun run gen:prompt-hook`).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as source from "./hook-config.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("hook-config.mjs contract", () => {
  it("gives the same plan and the same answers as the source", async () => {
    const bundle = (await import(
      join(here, "..", "..", "plugin", "hooks", "hook-config.mjs")
    )) as typeof source;
    expect(bundle.CLAUDE_HOOKS_VERSION).toBe(source.CLAUDE_HOOKS_VERSION);
    expect(bundle.planHash(bundle.CLAUDE_HOOK_PLAN)).toBe(
      source.planHash(source.CLAUDE_HOOK_PLAN),
    );
    expect(Object.keys(bundle.EARLIER_CLAUDE_HOOK_PLANS)).toEqual(
      Object.keys(source.EARLIER_CLAUDE_HOOK_PLANS),
    );
    const launcher = `"/n" "/p/prism-hook.mjs"`;
    for (const plan of [
      source.CLAUDE_HOOK_PLAN,
      ...Object.values(source.EARLIER_CLAUDE_HOOK_PLANS),
    ]) {
      const hooks = source.claudeHookEntries(launcher, plan);
      expect(bundle.inspectClaudeHooks(hooks)).toEqual(
        source.inspectClaudeHooks(hooks),
      );
      expect(bundle.mergeClaudeHooks(hooks, launcher)).toEqual(
        source.mergeClaudeHooks(hooks, launcher),
      );
    }
  });
});
