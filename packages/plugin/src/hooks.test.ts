import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hook = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "hooks",
  "prism-hook.mjs",
);
/** The ruleset the session hook injects (plan P16). */
const rules = readFileSync(
  join(dirname(hook), "prism-rules.md"),
  "utf8",
).trim();

function layout(snapshot: Record<string, unknown>): {
  home: string;
  cwd: string;
} {
  const home = mkdtempSync(join(tmpdir(), "prism-hook-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "prism-hook-repo-"));
  const key = createHash("sha256")
    .update(realpathSync(cwd))
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
    // Not under Claude Code unless a test says so (it changes session rules).
    env: { ...process.env, PRISM_HOME: home, CLAUDE_PROJECT_DIR: "" },
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
  // The hook imports its classifier and reads its ruleset as siblings, as the built pack ships them.
  for (const file of [
    "prism-hook.mjs",
    "classify-prompt.mjs",
    "prompt-hook.mjs",
    "hook-config.mjs",
    "prism-rules.md",
  ]) {
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
    // Claude Code: its stop hook prints the receipt.
    expect(out.hookSpecificOutput?.additionalContext).toContain(
      "When you stop, Prism runs the checks this change reaches and prints a receipt.",
    );
  });

  it("a host with no stop hook is told to call receipt instead", () => {
    const { home, cwd } = layout({
      orientation: "Prism · demo: a library.",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    for (const payload of [
      { cwd, workspace_roots: [cwd] },
      { cwd, host: "opencode" },
    ]) {
      const text = run("session", home, payload).hookSpecificOutput
        ?.additionalContext;
      expect(text).toContain("call receipt and report its verdict");
      expect(text).not.toContain("prints a receipt");
    }
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
      .update(realpathSync(cwd))
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

  it("HK-11 the outside-pack note uses this session's own pack, after the edit (round 4)", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [],
    });
    const key = createHash("sha256")
      .update(realpathSync(cwd))
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
    const fire = (event: string) => (session: string, file: string) =>
      run(event, home, {
        cwd,
        session_id: session,
        tool_input: { file_path: join(cwd, file) },
      }).hookSpecificOutput?.additionalContext;
    const before = fire("before-edit");
    const edit = fire("after-edit");
    // Nothing before the edit: a note there arrives with the edit under way.
    expect(before("B", "src/a.ts")).toBeUndefined();
    // The first edit of a session names the tools to call next, by tool id.
    const first = edit("B", "src/b.ts");
    expect(first).toContain("mcp__prism__test_impact");
    expect(first).toContain("mcp__prism__blast_radius");
    expect(first).not.toMatch(/not in Prism's pack/);
    const outside = edit("B", "src/a.ts");
    expect(outside).toMatch(
      /src\/a\.ts is not in Prism's pack: call mcp__prism__blast_radius/,
    );
    expect(outside).not.toContain("test_impact");
    // Once a session: the next file outside the pack is edited quietly.
    expect(edit("B", "src/c.ts")).toBeUndefined();
    const other = edit("A", "src/a.ts");
    expect(other).not.toMatch(/not in Prism's pack/);
    expect(other).toContain("mcp__prism__test_impact");
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
    // A question reaches the daemon for a lens at most; never a file pack.
    expect(events).not.toMatch(/"event":"prompt\.injected"/);
    expect(events).toMatch(/"event":"prompt\.non_english"/);
  });

  it("STR-2 strength off: every event answers {} fast and says why", () => {
    const { home, cwd } = layout({
      orientation: "Prism · demo",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({ strength: "off" }),
    );
    for (const event of ["session", "prompt", "before-edit", "stop"]) {
      expect(
        run(event, home, {
          cwd,
          prompt: "fix renderDashboard so it shows the widget count",
          tool_input: { file_path: "a.ts" },
        }),
      ).toEqual({});
      const last = lastEvent(home);
      expect(last).toMatchObject({
        outcome: "skipped",
        reason: "strength off",
      });
      expect(last.durationMs as number).toBeLessThan(50);
    }
  });

  it("STR-3 strength lite: session gets only the ruleset; prompts and edits get nothing", () => {
    const { home, cwd } = layout({
      orientation: "Prism · demo: a library.",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({ strength: "lite" }),
    );
    expect(
      run("session", home, { cwd }).hookSpecificOutput?.additionalContext,
    ).toBe(rules);
    expect(
      run("prompt", home, {
        cwd,
        prompt: "fix renderDashboard so it shows the widget count",
      }),
    ).toEqual({});
    expect(lastEvent(home)).toMatchObject({ reason: "strength lite" });
  });

  it("STR-4 the repository's .prism/config.json overrides ~/.prism/config.json", () => {
    const { home, cwd } = layout({
      orientation: "Prism · demo: a library.",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({ strength: "off" }),
    );
    mkdirSync(join(cwd, ".prism"), { recursive: true });
    writeFileSync(
      join(cwd, ".prism", "config.json"),
      JSON.stringify({ strength: "full" }),
    );
    const context = run("session", home, { cwd }).hookSpecificOutput
      ?.additionalContext;
    expect(context?.startsWith(rules)).toBe(true);
    expect(context).toContain("a library");
  });

  it("R2 sends the start block once: a resumed session gets nothing, a compacted one gets it again", () => {
    const { home, cwd } = layout({
      orientation: "Prism · demo: a library.",
      offLimits: [],
      needsSignOff: [],
      hookArmed: false,
    });
    const first = run("session", home, {
      cwd,
      session_id: "s-r",
      source: "startup",
    }).hookSpecificOutput?.additionalContext;
    expect(first).toContain("a library");
    expect(
      run("session", home, { cwd, session_id: "s-r", source: "resume" }),
    ).toEqual({});
    expect(lastEvent(home)).toMatchObject({
      reason: "resumed session: start block already sent",
    });
    expect(
      run("session", home, { cwd, session_id: "s-r", source: "compact" })
        .hookSpecificOutput?.additionalContext,
    ).toBe(first);
  });

  it("HOOK-T1 a trivial edit prompt gets no injection and no auto-Prepare", () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [],
    });
    expect(
      run("prompt", home, { cwd, prompt: "fix the typo in the README" }),
    ).toEqual({});
    const events = readFileSync(join(home, "events.jsonl"), "utf8");
    expect(events).toMatch(/"event":"prompt\.trivial"/);
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

  it("HOOK-1 with no snapshot: session gets only the ruleset, edits get {}, and both record why", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-hook-empty-"));
    const cwd = mkdtempSync(join(tmpdir(), "prism-hook-empty-repo-"));
    expect(
      run("session", home, { cwd }).hookSpecificOutput?.additionalContext,
    ).toBe(rules);
    expect(lastEvent(home)).toMatchObject({
      event: "hook.session",
      outcome: "ok",
      detail: { said: "rules (no snapshot yet)" },
    });
    expect(
      run("before-edit", home, { cwd, tool_input: { file_path: "a.ts" } }),
    ).toEqual({});
    expect(lastEvent(home)).toMatchObject({
      event: "hook.before-edit",
      outcome: "skipped",
      reason: "no snapshot yet",
    });
  });

  it("moves a corrupt snapshot aside, answers {} and logs index.corrupt (plan §2.4)", () => {
    const { home, cwd } = layout({});
    const key = createHash("sha256")
      .update(realpathSync(cwd))
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

  it("HOOK-STOP-1 stop past its 1 s budget or with no answer says nothing to the agent", () => {
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
    expect(
      run("session", home, { cwd }).hookSpecificOutput?.additionalContext,
    ).toBe(rules);
    expect((lastEvent(home).detail as { said: string }).said).toMatch(
      /^rules \(stale snapshot/,
    );
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

/** A stand-in daemon: `/v1/ready` and `/v1/call` answer what the test says. */
async function fakeDaemon(
  home: string,
  answer: {
    ready?: boolean;
    prep?: unknown;
    prompt?: unknown;
    receipt?: unknown;
    status?: unknown;
    hang?: boolean;
    seen?: string[];
  },
): Promise<Server> {
  const server = createServer((req, res) => {
    if (answer.hang) return; // a daemon blocked mid-index
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      answer.seen?.push(req.url ?? "");
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/v1/ready") {
        res.end(
          JSON.stringify({
            ok: true,
            value: {
              ready: answer.ready ?? true,
              state: answer.ready === false ? "indexing" : "ready",
            },
          }),
        );
      } else if (req.url === "/v1/call") {
        res.end(JSON.stringify({ ok: true, value: answer.prep }));
      } else if (req.url === "/v1/prompt" && answer.prompt) {
        res.end(JSON.stringify({ ok: true, value: answer.prompt }));
      } else if (req.url === "/v1/health" && answer.receipt) {
        res.end(JSON.stringify({ ok: true }));
      } else if (req.url === "/v1/receipt" && answer.receipt) {
        res.end(JSON.stringify({ ok: true, value: answer.receipt }));
      } else if (req.url === "/v1/receipt-status" && answer.status) {
        res.end(JSON.stringify({ ok: true, value: answer.status }));
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  mkdirSync(join(home, "daemon"), { recursive: true });
  writeFileSync(
    join(home, "daemon", "daemon.json"),
    JSON.stringify({ pid: process.pid, port, token: "t", buildId: "test" }),
  );
  return server;
}

/** Run the hook without blocking this process, so the fake daemon can answer. */
function runAsync(
  event: string,
  home: string,
  input: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<{
  out: {
    hookSpecificOutput?: { additionalContext?: string };
    systemMessage?: string;
  };
  ms: number;
}> {
  const t0 = Date.now();
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [hook, event], {
      env: {
        ...process.env,
        PRISM_HOME: home,
        PRISM_DAEMON: "1",
        CLAUDE_PROJECT_DIR: "",
        ...env,
      },
    });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("error", fail);
    child.on("close", () => {
      try {
        done({ out: JSON.parse(stdout), ms: Date.now() - t0 });
      } catch (error) {
        fail(error);
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

describe("stop hook (round 2)", () => {
  it("shows the receipt to the user and gives the agent nothing to answer", async () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [],
    });
    const server = await fakeDaemon(home, {
      receipt: {
        id: "r1",
        verdict: "not_proven",
        reason: "untested",
        checksState: "pending",
        touched: { totalFiles: 1, dependents: 0 },
        checks: [],
        testFiles: [],
        unsupported: [],
        lensFindings: [],
      },
    });
    try {
      const { out } = await runAsync("stop", home, { cwd, session_id: "st-1" });
      expect(out.systemMessage).toMatch(/^Prism · NOT PROVEN \(untested\)/);
      // Stop context would make the agent take one more turn just to reply.
      expect(out.hookSpecificOutput).toBeUndefined();
    } finally {
      server.close();
    }
  });
});

describe("stop hook makes no token-savings claim (2.0.0)", () => {
  for (const estimatedSaved of [7500, -6000, null]) {
    it(`value line has no tokens or saving (stored estimatedSaved: ${estimatedSaved})`, async () => {
      const { home, cwd } = layout({
        orientation: "x",
        offLimits: [],
        needsSignOff: [],
      });
      const server = await fakeDaemon(home, {
        receipt: {
          id: "r-val",
          verdict: "proven",
          checksState: "done",
          touched: { totalFiles: 1, dependents: 0 },
          checks: [],
          testFiles: [],
          unsupported: [],
          lensFindings: [],
          // A receipt written before this change may still carry the key.
          value: {
            filesCovered: 5,
            filesRemembered: 5,
            issuesCaught: 1,
            checksSuggested: 0,
            estimatedSaved,
          },
        },
      });
      try {
        const { out } = await runAsync("stop", home, {
          cwd,
          session_id: `st-val-${String(estimatedSaved)}`,
        });
        expect(out.systemMessage).toContain(
          "Prism: remembered 5 files for next time · 1 issue caught",
        );
        expect(out.systemMessage).not.toMatch(/tokens|saved/i);
      } finally {
        server.close();
      }
    });
  }
});

describe("stop hook shows the last finished verdict (round 4)", () => {
  it("a pending receipt carries the earlier change's finished verdict", async () => {
    const { home, cwd } = layout({
      orientation: "x",
      offLimits: [],
      needsSignOff: [],
    });
    const server = await fakeDaemon(home, {
      receipt: {
        id: "r2",
        verdict: "not_proven",
        reason: "still_running",
        checksState: "pending",
        touched: { totalFiles: 1, dependents: 0 },
        checks: [],
        testFiles: [],
        unsupported: [],
        lensFindings: [],
        earlier: {
          id: "r1",
          verdict: "ship",
          summary: "SHIP — typecheck, lint and 3 tests passed",
        },
      },
    });
    try {
      const { out } = await runAsync("stop", home, { cwd, session_id: "st-2" });
      expect(out.systemMessage).toMatch(/still_running/);
      expect(out.systemMessage).toContain(
        "Earlier change  SHIP — typecheck, lint and 3 tests passed",
      );
      expect(out.hookSpecificOutput).toBeUndefined();
    } finally {
      server.close();
    }
  });
});

/** Run the hook for its exit code and stderr (asyncRewake hooks speak there). */
function runRaw(
  event: string,
  home: string,
  input: Record<string, unknown>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [hook, event], {
      env: {
        ...process.env,
        PRISM_HOME: home,
        PRISM_DAEMON: "1",
        CLAUDE_PROJECT_DIR: "",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", fail);
    child.on("close", (code) => done({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

/** A receipt from the fake daemon for the stop-wait tests. */
const stopReceipt = (over: Record<string, unknown>) => ({
  id: "r9",
  verdict: "not_proven",
  reason: "still_running",
  checksState: "pending",
  touched: { totalFiles: 1, dependents: 2 },
  checks: [],
  testFiles: ["src/a.test.ts"],
  unsupported: [],
  lensFindings: [],
  ...over,
});

describe("session-end verdict: stop-wait wakes the agent (round 4)", () => {
  const snapshot = { orientation: "x", offLimits: [], needsSignOff: [] };

  it("checks still running at stop: the verdict comes back in the same session", async () => {
    const { home, cwd } = layout(snapshot);
    const seen: string[] = [];
    const server = await fakeDaemon(home, {
      receipt: stopReceipt({}),
      status: {
        running: false,
        receipt: stopReceipt({
          verdict: "proven",
          reason: undefined,
          checksState: "done",
        }),
      },
      seen,
    });
    try {
      const input = { cwd, session_id: "sw-1", hook_event_name: "Stop" };
      // Claude Code starts both Stop hooks together.
      const [stop, wait] = await Promise.all([
        runAsync("stop", home, input),
        runRaw("stop-wait", home, input),
      ]);
      expect(stop.out.systemMessage).toContain("checks still running");
      expect(wait.code).toBe(2);
      expect(wait.stderr).toMatch(/^Prism · SHIP\n/);
      expect(wait.stderr).toContain("Tell the user this verdict in one line");
      // It waited on the stopped receipt only; it never asked for a new one.
      expect(seen.filter((u) => u === "/v1/receipt")).toHaveLength(1);
      expect(seen).toContain("/v1/receipt-status");

      // The agent's reply ends in another stop: same change, already shown.
      const again = await runRaw("stop-wait", home, input);
      expect(again.code).toBe(0);
      expect(again.stderr).toBe("");
    } finally {
      server.close();
    }
  });

  it("a failed check wakes the agent to fix it before saying done", async () => {
    const { home, cwd } = layout(snapshot);
    const server = await fakeDaemon(home, {
      receipt: stopReceipt({}),
      status: {
        running: false,
        receipt: stopReceipt({
          verdict: "failed",
          reason: undefined,
          checksState: "done",
          checks: [{ name: "test", status: "failed" }],
        }),
      },
    });
    try {
      const input = { cwd, session_id: "sw-2", hook_event_name: "Stop" };
      const [, wait] = await Promise.all([
        runAsync("stop", home, input),
        runRaw("stop-wait", home, input),
      ]);
      expect(wait.code).toBe(2);
      expect(wait.stderr).toMatch(/^Prism · NO-SHIP \(1 check failed\)/);
      expect(wait.stderr).toContain("fix the failures before you say done");
    } finally {
      server.close();
    }
  });

  it("a final verdict stop already showed still wakes the agent, once (round 5)", async () => {
    const { home, cwd } = layout(snapshot);
    const seen: string[] = [];
    const untested = stopReceipt({ reason: "untested", checksState: "done" });
    const server = await fakeDaemon(home, {
      receipt: untested,
      status: { running: false, receipt: untested },
      seen,
    });
    try {
      const input = { cwd, session_id: "sw-3", hook_event_name: "Stop" };
      const [stop, wait] = await Promise.all([
        runAsync("stop", home, input),
        runRaw("stop-wait", home, input),
      ]);
      expect(stop.out.systemMessage).toMatch(
        /^Prism · NOT PROVEN \(untested\)/,
      );
      expect(wait.code).toBe(2);
      expect(wait.stderr).toMatch(/^Prism · NOT PROVEN \(untested\)\n/);
      expect(wait.stderr).toContain("Tell the user this verdict in one line");
      // The agent's reply ends in another stop on the same change: no loop.
      const [, again] = await Promise.all([
        runAsync("stop", home, input),
        runRaw("stop-wait", home, input),
      ]);
      expect(again.code).toBe(0);
      expect(again.stderr).toBe("");
    } finally {
      server.close();
    }
  });

  it("never wakes for nothing changed or superseded, or with no daemon (round 5)", async () => {
    const quiet = [
      stopReceipt({
        verdict: "proven",
        reason: undefined,
        checksState: "done",
        touched: { totalFiles: 0, dependents: 0 },
      }),
      stopReceipt({ reason: "superseded", checksState: "done" }),
    ];
    for (const [n, settled] of quiet.entries()) {
      const { home, cwd } = layout(snapshot);
      const server = await fakeDaemon(home, {
        receipt: stopReceipt({}),
        status: { running: false, receipt: settled },
      });
      try {
        const input = { cwd, session_id: `sw-q${n}`, hook_event_name: "Stop" };
        const [, wait] = await Promise.all([
          runAsync("stop", home, input),
          runRaw("stop-wait", home, input),
        ]);
        expect(wait.code).toBe(0);
        expect(wait.stderr).toBe("");
      } finally {
        server.close();
      }
    }
    const { home: bare, cwd: bareCwd } = layout(snapshot);
    const none = await runRaw("stop-wait", bare, {
      cwd: bareCwd,
      session_id: "sw-4",
    });
    expect(none.code).toBe(0);
    expect(none.stderr).toBe("");
  });

  it("wakes for every NOT PROVEN reason except superseded (round 5)", async () => {
    for (const reason of [
      "untested",
      "no_node_modules",
      "unknown_runner",
      "skipped_offline",
      "timeout",
      "already_failing",
      "unsupported_language",
    ]) {
      const { home, cwd } = layout(snapshot);
      const server = await fakeDaemon(home, {
        receipt: stopReceipt({}),
        status: {
          running: false,
          receipt: stopReceipt({ reason, checksState: "done" }),
        },
      });
      try {
        const input = {
          cwd,
          session_id: `sw-${reason}`,
          hook_event_name: "Stop",
        };
        const [, wait] = await Promise.all([
          runAsync("stop", home, input),
          runRaw("stop-wait", home, input),
        ]);
        expect(wait.code).toBe(2);
        expect(wait.stderr).toMatch(
          new RegExp(`^Prism · NOT PROVEN \\(${reason}\\)\n`),
        );
      } finally {
        server.close();
      }
    }
  });
});

describe("prompt hook injects the prepare pack (token fixes 1, 2, 4)", () => {
  const snapshot = { orientation: "x", offLimits: [], needsSignOff: [] };

  it("injects the daemon's block, then the lens, inside the budget", async () => {
    const { home, cwd } = layout(snapshot);
    const block =
      "Prism · files for this task\n- src/array/chunk.ts: named in task\nRun: npx vitest run src/array/chunk.spec.ts";
    const server = await fakeDaemon(home, {
      prompt: {
        text: block,
        reason: "1 confident file",
        summary: ["1 file (chunk.ts)"],
      },
    });
    try {
      const { out, ms } = await runAsync("prompt", home, {
        cwd,
        session_id: "s1",
        prompt: "refactor chunk so it avoids the extra array copies",
      });
      const text = out.hookSpecificOutput?.additionalContext ?? "";
      expect(text.startsWith(`${block}\nLens: Dev\n`)).toBe(true);
      expect(text).not.toContain(rules.split("\n")[0]!);
      // Round 4: the user sees one line for what the agent got.
      expect(out.systemMessage).toBe("Prism · Dev lens + 1 file (chunk.ts)");
      expect(ms).toBeLessThan(1000);
    } finally {
      server.close();
    }
    const events = readFileSync(join(home, "events.jsonl"), "utf8");
    expect(events).toMatch(/"event":"prompt\.injected"/);
  });

  it("sends only the lens when the daemon is not sure of any file", async () => {
    const { home, cwd } = layout(snapshot);
    const server = await fakeDaemon(home, {
      prompt: { text: "", reason: "no confident file" },
    });
    try {
      const { out } = await runAsync("prompt", home, {
        cwd,
        session_id: "s2",
        prompt: "make the dashboard faster somehow",
      });
      const text = out.hookSpecificOutput?.additionalContext ?? "";
      expect(text).toMatch(/^Lens: Dev\n/);
      expect(text).not.toContain("Prism · files");
    } finally {
      server.close();
    }
    const events = readFileSync(join(home, "events.jsonl"), "utf8");
    expect(events).toMatch(/"event":"prompt\.injected".*no confident file/);
  });

  it("a prompt naming its files gets the lite pack and no outside-pack nudges", async () => {
    const { home, cwd } = layout(snapshot);
    mkdirSync(join(cwd, "src", "array"), { recursive: true });
    writeFileSync(join(cwd, "src", "array", "chunk.spec.ts"), "");
    const server = await fakeDaemon(home, {
      prompt: {
        text: "Prism · files for this task\n- src/array/chunk.ts: named in task\nRun: npx vitest run src/array/chunk.spec.ts",
        reason: "prompt names its files",
        named: true,
      },
    });
    try {
      const { out } = await runAsync("prompt", home, {
        cwd,
        session_id: "lite-1",
        prompt: "make src/array/chunk.spec.ts pass; chunk.ts is wrong",
      });
      const text = out.hookSpecificOutput?.additionalContext ?? "";
      expect(text).toContain("src/array/chunk.ts");
      expect(text).toContain("Run: npx vitest run src/array/chunk.spec.ts");
      expect(text.length).toBeLessThanOrEqual(1200);
    } finally {
      server.close();
    }
    const key = createHash("sha256")
      .update(realpathSync(cwd))
      .digest("hex")
      .slice(0, 24);
    const packs = join(home, "workspaces", key, "hooks", "packs");
    mkdirSync(packs, { recursive: true });
    writeFileSync(
      join(
        packs,
        `${createHash("sha256").update("lite-1").digest("hex").slice(0, 24)}.json`,
      ),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        packFiles: [{ path: "src/array/chunk.ts" }],
      }),
    );
    const note = run("before-edit", home, {
      cwd,
      session_id: "lite-1",
      tool_input: { file_path: join(cwd, "src/array/other.ts") },
    }).hookSpecificOutput?.additionalContext;
    expect(note).toBeUndefined();
  });

  it("a daemon busy indexing still lets the lens through inside 1 s (round 3)", async () => {
    const { home, cwd } = layout(snapshot);
    for (const [i, answer] of [{ hang: true }, { ready: false }].entries()) {
      const server = await fakeDaemon(home, answer);
      try {
        const { out, ms } = await runAsync("prompt", home, {
          cwd,
          session_id: `busy-${i}`,
          prompt: "refactor chunk so it avoids the extra array copies",
        });
        const text = out.hookSpecificOutput?.additionalContext ?? "";
        expect(text).toMatch(/^Lens: Dev\n/);
        expect(text).not.toContain("Prism · files");
        expect(out.systemMessage).toBe(
          "Prism · Dev lens + files skipped (index busy)",
        );
        expect(ms).toBeLessThan(1000);
      } finally {
        server.closeAllConnections();
        server.close();
      }
    }
  });

  it("under Claude Code the session hook leaves the ruleset to the MCP instructions", () => {
    const { home, cwd } = layout({ ...snapshot, orientation: "Prism · demo" });
    const result = spawnSync(process.execPath, [hook, "session"], {
      input: JSON.stringify({ cwd }),
      encoding: "utf8",
      env: { ...process.env, PRISM_HOME: home, CLAUDE_PROJECT_DIR: cwd },
    });
    const text = JSON.parse(result.stdout).hookSpecificOutput
      ?.additionalContext;
    expect(text).toBe(
      "Prism · demo\nWhen you stop, Prism runs the checks this change reaches and prints a receipt.",
    );
  });
});

describe("session hook upgrades an old Prism hook config (round 4)", () => {
  type HookConfig = {
    claudeHookEntries: (
      launcher: string,
      plan?: unknown,
    ) => Record<string, { hooks: Record<string, unknown>[] }[]>;
    inspectClaudeHooks: (hooks: unknown) => { state: string };
    EARLIER_CLAUDE_HOOK_PLANS: Record<string, unknown>;
  };
  const config = () =>
    import(join(dirname(hook), "hook-config.mjs")) as Promise<HookConfig>;
  const launcher = `"${process.execPath}" "${hook}"`;

  function session(prismHome: string, userHome: string, cwd: string) {
    const result = spawnSync(process.execPath, [hook, "session"], {
      input: JSON.stringify({ cwd, session_id: "hc-1", source: "startup" }),
      encoding: "utf8",
      env: {
        ...process.env,
        PRISM_HOME: prismHome,
        HOME: userHome,
        PRISM_HOOK_REFRESH: "1",
        PRISM_DAEMON: "0",
        CLAUDE_PROJECT_DIR: "",
      },
    });
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout) as { systemMessage?: string };
  }

  function settings(dir: string, hooks: unknown): string {
    const path = join(dir, ".claude", "settings.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ model: "x", hooks }, null, 2));
    return path;
  }

  it("rewrites an earlier release's entries to this one, once, with a backup", async () => {
    const { claudeHookEntries, inspectClaudeHooks, EARLIER_CLAUDE_HOOK_PLANS } =
      await config();
    const { home, cwd } = layout({ orientation: "x" });
    const userHome = mkdtempSync(join(tmpdir(), "prism-hook-userhome-"));
    const old = claudeHookEntries(
      launcher,
      EARLIER_CLAUDE_HOOK_PLANS["2.0.0-pre"],
    );
    old.Stop!.unshift({ hooks: [{ type: "command", command: "say done" }] });
    const path = settings(userHome, old);

    const first = session(home, userHome, cwd);
    expect(first.systemMessage).toMatch(
      /^Prism updated its Claude Code hooks to 2\.0\.0 \(backup .*settings\.json\.prism-backup-2\.0\.0-pre\)/,
    );
    const after = JSON.parse(readFileSync(path, "utf8"));
    expect(after.model).toBe("x");
    expect(inspectClaudeHooks(after.hooks).state).toBe("current");
    expect(JSON.stringify(after.hooks.Stop)).toContain("stop-wait");
    expect(after.hooks.Stop[0]).toEqual({
      hooks: [{ type: "command", command: "say done" }],
    });
    expect(existsSync(`${path}.prism-backup-2.0.0-pre`)).toBe(true);

    expect(session(home, userHome, cwd).systemMessage).toBeUndefined();
  });

  it("a hand-edited config is left alone: one line a day naming the command", async () => {
    const { claudeHookEntries, EARLIER_CLAUDE_HOOK_PLANS } = await config();
    const { home, cwd } = layout({ orientation: "x" });
    const userHome = mkdtempSync(join(tmpdir(), "prism-hook-userhome-"));
    const edited = claudeHookEntries(
      launcher,
      EARLIER_CLAUDE_HOOK_PLANS["2.0.0-pre"],
    );
    edited.Stop![0]!.hooks[0]!.timeout = 30;
    const path = settings(cwd, edited);
    const before = readFileSync(path, "utf8");

    expect(session(home, userHome, cwd).systemMessage).toBe(
      "Prism's Claude Code hooks are out of date and were not changed: Prism's hook entries were changed by hand. Run `prism install claude --project`.",
    );
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(session(home, userHome, cwd).systemMessage).toBeUndefined();
  });

  it("leaves a config whose Prism hooks run another pack", async () => {
    const { claudeHookEntries, EARLIER_CLAUDE_HOOK_PLANS } = await config();
    const { home, cwd } = layout({ orientation: "x" });
    const userHome = mkdtempSync(join(tmpdir(), "prism-hook-userhome-"));
    const other = claudeHookEntries(
      `"${process.execPath}" "/elsewhere/prism-hook.mjs"`,
      EARLIER_CLAUDE_HOOK_PLANS["2.0.0-pre"],
    );
    const path = settings(userHome, other);
    const before = readFileSync(path, "utf8");
    expect(session(home, userHome, cwd).systemMessage).toBeUndefined();
    expect(readFileSync(path, "utf8")).toBe(before);
  });
});
