/**
 * PR 10: the stop line names the real update command when the daily npm
 * check's cache says a newer Prism is out. Cache only: no network in stop.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const hooks = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks");
const LINE =
  "Prism 2.0.1 is out. To update, run: npm i -g @repo-prism/cli@latest";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** The hook as `npm i -g @repo-prism/cli` lays it out, plus a fake server bin. */
function npmLayout(version = "2.0.0", underNodeModules = true) {
  const root = mkdtempSync(join(tmpdir(), "prism-update-hook-"));
  dirs.push(root);
  const plugin = underNodeModules
    ? join(root, "lib", "node_modules", "@repo-prism", "plugin")
    : join(root, "checkout", "packages", "plugin");
  const dir = join(plugin, "dist", "pack", "hooks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(plugin, "package.json"), JSON.stringify({ version }));
  for (const file of [
    "prism-hook.mjs",
    "classify-prompt.mjs",
    "prompt-hook.mjs",
    "hook-config.mjs",
    "prism-rules.md",
  ])
    writeFileSync(join(dir, file), readFileSync(join(hooks, file), "utf8"));
  const home = join(root, "prism-home");
  mkdirSync(home);
  const bin = join(root, "fake-bin.mjs");
  writeFileSync(
    bin,
    `process.stdout.write(JSON.stringify({ systemMessage: "Prism · SHIP" }));\n`,
  );
  const cwd = join(root, "repo");
  mkdirSync(cwd);
  return { hook: join(dir, "prism-hook.mjs"), home, bin, cwd };
}

function stop(
  l: ReturnType<typeof npmLayout>,
  env: Record<string, string> = {},
) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [l.hook, "stop"], {
    input: JSON.stringify({ cwd: l.cwd }),
    encoding: "utf8",
    env: {
      ...process.env,
      PRISM_HOME: l.home,
      PRISM_MCP_BIN: l.bin,
      PRISM_DAEMON: "0",
      PRISM_HOOK_REFRESH: "0",
      PRISM_SKIP_SELF_UPDATE: "",
      ...env,
    },
  });
  expect(result.status).toBe(0);
  return {
    message: (JSON.parse(result.stdout) as { systemMessage?: string })
      .systemMessage,
    ms: Date.now() - started,
  };
}

function cache(home: string, latest: string) {
  writeFileSync(
    join(home, "update.json"),
    JSON.stringify({ checkedAt: "2026-10-17T00:00:00.000Z", latest }),
  );
}

describe("stop: update notice from the cache (PR 10)", () => {
  it("adds the line when the cache has a newer version, once a day", () => {
    const l = npmLayout("2.0.0");
    cache(l.home, "2.0.1");
    const first = stop(l);
    expect(first.message).toBe(`Prism · SHIP\n${LINE}`);
    expect(first.ms).toBeLessThan(1000);
    expect(stop(l).message).toBe("Prism · SHIP");
  });

  it("no line when current, with no cache, a broken cache, or opted out", () => {
    const l = npmLayout("2.0.1");
    expect(stop(l).message).toBe("Prism · SHIP");
    cache(l.home, "2.0.1");
    expect(stop(l).message).toBe("Prism · SHIP");
    writeFileSync(join(l.home, "update.json"), "{not json");
    expect(stop(l).message).toBe("Prism · SHIP");
    cache(l.home, "2.0.2");
    expect(stop(l, { PRISM_SKIP_SELF_UPDATE: "1" }).message).toBe(
      "Prism · SHIP",
    );
  });

  it("a checkout (not under node_modules) never shows it", () => {
    const l = npmLayout("2.0.0", false);
    cache(l.home, "9.0.0");
    expect(stop(l).message).toBe("Prism · SHIP");
  });
});
