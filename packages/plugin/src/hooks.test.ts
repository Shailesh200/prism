import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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
    JSON.stringify({ version: 2, workspace: resolve(cwd), ...snapshot }),
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

function lastEvent(home: string): Record<string, unknown> {
  const lines = readFileSync(join(home, "events.jsonl"), "utf8")
    .trim()
    .split("\n");
  return JSON.parse(lines[lines.length - 1] ?? "{}");
}

/** A copy of the hook outside the repo, so the dev-build fallback cannot find a bin. */
function isolatedHook(home: string): string {
  const dir = join(home, "pack", "a", "b");
  mkdirSync(dir, { recursive: true });
  // The hook imports its classifier as a sibling, as the built pack ships it.
  for (const file of ["prism-hook.mjs", "classify-prompt.mjs"]) {
    writeFileSync(
      join(dir, file),
      readFileSync(join(dirname(hook), file), "utf8"),
    );
  }
  return join(dir, "prism-hook.mjs");
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

  it("HK-8 denies an edit to a generated or vendored file, with the reason", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [{ path: "vendor/", reason: "vendor" }],
      needsSignOff: [],
    });
    const out = run("before-edit", home, {
      cwd,
      tool_input: { file_path: join(cwd, "vendor/legacy.ts") },
    });
    expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("HK-9 a high-blast file only warns; the edit goes through (never deny)", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [{ path: "src/shared/util.ts", reason: "40 dependents" }],
      hookArmed: true,
    });
    const out = run("before-edit", home, {
      cwd,
      tool_input: { file_path: join(cwd, "src/shared/util.ts") },
    });
    expect(out.hookSpecificOutput?.additionalContext).toMatch(/needs sign-off/);
    expect(out.hookSpecificOutput?.permissionDecision).toBeUndefined();
  });

  it("HK-11 the outside-pack note uses this session's own pack", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [],
    });
    const key = createHash("sha256")
      .update(resolve(cwd))
      .digest("hex")
      .slice(0, 24);
    const packs = join(home, "workspaces", key, "hooks", "packs");
    mkdirSync(packs, { recursive: true });
    const write = (id: string, path: string) =>
      writeFileSync(
        join(
          packs,
          `${createHash("sha256").update(id).digest("hex").slice(0, 24)}.json`,
        ),
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          packFiles: [{ path }],
        }),
      );
    write("A", "src/a.ts");
    write("B", "src/b.ts");
    const edit = (session: string, file: string) =>
      run("before-edit", home, {
        cwd,
        session_id: session,
        tool_input: { file_path: join(cwd, file) },
      }).hookSpecificOutput?.additionalContext;
    expect(edit("B", "src/b.ts")).toBeUndefined();
    expect(edit("B", "src/a.ts")).toMatch(/not in Prism's pack/);
    expect(edit("A", "src/a.ts")).toBeUndefined();
  });

  it("HK-2/HK-4 questions get nothing; a non-English prompt gets one note per session", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [],
    });
    expect(
      run("prompt", home, {
        cwd,
        prompt: "how does src/hono.ts reach src/compose.ts?",
      }),
    ).toEqual({});
    const hindi = "डैशबोर्ड पर due date गलत दिख रही है, ठीक करो";
    expect(
      run("prompt", home, { cwd, session_id: "s", prompt: hindi })
        .hookSpecificOutput?.additionalContext,
    ).toBe("Prism understands English prompts only in 2.0; no pack added.");
    expect(
      run("prompt", home, { cwd, session_id: "s", prompt: hindi }),
    ).toEqual({});
    const events = readFileSync(join(home, "events.jsonl"), "utf8");
    expect(events).toMatch(/"event":"prompt\.question"/);
    expect(events).toMatch(/"event":"prompt\.non_english"/);
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

  it("HOOK-1 answers {} with no snapshot and records why", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-hook-empty-"));
    const cwd = mkdtempSync(join(tmpdir(), "prism-hook-empty-repo-"));
    expect(run("session", home, { cwd })).toEqual({});
    expect(lastEvent(home)).toMatchObject({
      event: "hook.session",
      outcome: "skipped",
      reason: "no snapshot yet",
    });
  });

  it("moves a corrupt snapshot aside, answers {} and logs index.corrupt (plan §2.4)", () => {
    const { home, cwd } = layout({});
    const key = createHash("sha256")
      .update(resolve(cwd))
      .digest("hex")
      .slice(0, 24);
    const dir = join(home, "workspaces", key, "hooks");
    writeFileSync(join(dir, "snapshot.json"), "{torn");
    expect(
      run("before-edit", home, { cwd, tool_input: { file_path: "a.ts" } }),
    ).toEqual({});
    expect(
      readdirSync(dir).some((name) =>
        /^snapshot\.json\.corrupt-\d+$/.test(name),
      ),
    ).toBe(true);
    const events = readFileSync(join(home, "events.jsonl"), "utf8");
    expect(events).toMatch(/"event":"index\.corrupt"/);
  });

  it("HOOK-STOP-1 stop past its 10 s budget or with no answer says nothing to the agent", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-hook-stop-"));
    const cwd = mkdtempSync(join(tmpdir(), "prism-hook-stop-repo-"));
    const bin = join(home, "fake-bin.mjs");
    writeFileSync(
      bin,
      "process.stderr.write('Error: secret stack trace');process.exit(1);\n",
    );
    const result = spawnSync(process.execPath, [isolatedHook(home), "stop"], {
      input: JSON.stringify({ cwd }),
      encoding: "utf8",
      env: { ...process.env, PRISM_HOME: home, PRISM_MCP_BIN: bin },
    });
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stdout).not.toMatch(/secret stack trace/);
    expect(lastEvent(home)).toMatchObject({
      event: "hook.stop",
      outcome: "degraded",
    });
  });

  it("HOOK-2 a snapshot for another HEAD is stale: {} and a reason", () => {
    const { home, cwd } = layout({
      orientation: "Prism · stale",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
      headSha: "0".repeat(40),
    });
    const git = (...args: string[]) =>
      spawnSync("git", args, { cwd, encoding: "utf8" });
    git("init", "-q");
    git(
      "-c",
      "user.email=t@t",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "x",
    );
    expect(run("session", home, { cwd })).toEqual({});
    expect(lastEvent(home).reason).toMatch(/^stale snapshot/);
  });

  it("HOOK-3 stop with no binary answers {} and logs install.missing_bin, never npx", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    const result = spawnSync(process.execPath, [isolatedHook(home), "stop"], {
      input: JSON.stringify({ cwd }),
      encoding: "utf8",
      env: { PATH: "", PRISM_HOME: home, HOME: home },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
    const events = readFileSync(join(home, "events.jsonl"), "utf8");
    expect(events).toContain('"install.missing_bin"');
    expect(events).not.toContain("npx");
  });
});
