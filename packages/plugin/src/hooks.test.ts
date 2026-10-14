import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hook = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "hooks",
  "prism-hook.mjs",
);

function layout(snapshot: Record<string, unknown>): {
  home: string;
  cwd: string;
} {
  const home = mkdtempSync(join(tmpdir(), "prism-hook-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "prism-hook-repo-"));
  const key = createHash("sha256")
    .update(resolve(cwd))
    .digest("hex")
    .slice(0, 24);
  const dir = join(home, "workspaces", key, "hooks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "snapshot.json"),
    JSON.stringify({ version: 1, workspace: resolve(cwd), ...snapshot }),
  );
  return { home, cwd };
}

function run(event: string, home: string, input: Record<string, unknown>) {
  const result = spawnSync(process.execPath, [hook, event], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, PRISM_HOME: home },
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as {
    hookSpecificOutput?: {
      additionalContext?: string;
      permissionDecision?: string;
    };
  };
}

describe("prism-hook", () => {
  it("stays silent when PRISM_HOOKS=0", () => {
    const result = spawnSync(process.execPath, [hook, "session"], {
      input: "{}",
      encoding: "utf8",
      env: { ...process.env, PRISM_HOOKS: "0" },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
  });

  it("injects the orientation at session start", () => {
    const { home, cwd } = layout({
      orientation: "Prism · demo: a library.",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    const out = run("session", home, { cwd });
    expect(out.hookSpecificOutput?.additionalContext).toContain("a library");
  });

  it("starts the graph daemon with this repository warm (M-095)", async () => {
    const { home, cwd } = layout({
      orientation: "Prism · demo",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    const marker = join(home, "daemon-argv.json");
    const fakeBin = join(home, "fake-mcp.mjs");
    writeFileSync(
      fakeBin,
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)));\n`,
    );
    const result = spawnSync(process.execPath, [hook, "session"], {
      input: JSON.stringify({ cwd }),
      encoding: "utf8",
      env: {
        ...process.env,
        PRISM_HOME: home,
        PRISM_MCP_BIN: fakeBin,
        PRISM_DAEMON: "1",
      },
    });
    expect(result.status).toBe(0);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual([
          "--daemon",
          "--warm",
          resolve(cwd),
        ]);
        return;
      } catch {
        await new Promise((done) => setTimeout(done, 50));
      }
    }
    throw new Error("the session hook did not start the daemon");
  });

  it("does not start a daemon under a test runner unless asked", () => {
    const { home, cwd } = layout({
      orientation: "Prism · demo",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    const marker = join(home, "daemon-argv.json");
    const fakeBin = join(home, "fake-mcp.mjs");
    writeFileSync(
      fakeBin,
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "started");\n`,
    );
    spawnSync(process.execPath, [hook, "session"], {
      input: JSON.stringify({ cwd }),
      encoding: "utf8",
      env: { ...process.env, PRISM_HOME: home, PRISM_MCP_BIN: fakeBin },
    });
    expect(() => readFileSync(marker, "utf8")).toThrow();
  });

  it("records the files already changed when the session starts (M-092)", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    const git = (...args: string[]) =>
      spawnSync("git", args, { cwd, encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    writeFileSync(join(cwd, "a.ts"), "1");
    git("add", ".");
    git("commit", "-qm", "init");
    writeFileSync(join(cwd, "a.ts"), "2");
    writeFileSync(join(cwd, "new.ts"), "x");
    run("session", home, { cwd, session_id: "s-1" });
    const key = createHash("sha256")
      .update(resolve(cwd))
      .digest("hex")
      .slice(0, 24);
    const path = join(home, "workspaces", key, "hooks", "session.json");
    const first = JSON.parse(readFileSync(path, "utf8"));
    expect(first).toMatchObject({
      sessionId: "s-1",
      dirty: ["a.ts", "new.ts"],
    });

    // Resuming the same session keeps the first baseline.
    writeFileSync(join(cwd, "later.ts"), "y");
    run("session", home, { cwd, session_id: "s-1" });
    expect(JSON.parse(readFileSync(path, "utf8")).dirty).toEqual([
      "a.ts",
      "new.ts",
    ]);
  });

  it("warns on a vendor path and does not block while the hook is unarmed", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [{ path: "vendor/", reason: "vendor" }],
      needsSignOff: [],
      hookArmed: false,
    });
    const out = run("before-edit", home, {
      cwd,
      tool_input: { file_path: join(cwd, "vendor/legacy.ts") },
    });
    expect(out.hookSpecificOutput?.additionalContext).toMatch(/vendor/);
    expect(out.hookSpecificOutput?.permissionDecision).toBeUndefined();
  });

  it("uses workspace_roots when cwd is not the repository", () => {
    const { home, cwd } = layout({
      orientation: "Prism · from the workspace root.",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    const elsewhere = mkdtempSync(join(tmpdir(), "prism-hook-elsewhere-"));
    const out = run("session", home, {
      cwd: elsewhere,
      workspace_roots: [cwd],
    });
    expect(out.hookSpecificOutput?.additionalContext).toContain(
      "from the workspace root",
    );
  });

  it("says the index is warming when there is no snapshot", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-hook-empty-"));
    const cwd = mkdtempSync(join(tmpdir(), "prism-hook-empty-repo-"));
    const out = run("session", home, { cwd });
    expect(out.hookSpecificOutput?.additionalContext).toMatch(
      /still indexing/i,
    );
  });
});
