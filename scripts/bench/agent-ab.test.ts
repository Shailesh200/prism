/**
 * Token fix 5: the A/B harness's pure parts.
 *   node --experimental-strip-types --test scripts/bench/agent-ab.test.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  AGENT_NO_CLAUDE_PLUGIN,
  AGENT_NO_PRISM,
  agentArgs,
  agentPrepare,
  agentUsage,
  hostStop,
  OPENCODE_PERMISSION,
  opencodeArgs,
  opencodeKey,
  opencodeReplies,
  opencodeUsage,
  stalePackFiles,
  prismBusy,
  wanted,
} from "./agent-ab.ts";

describe("agent-ab harness", () => {
  it("refuses a dev pack whose hooks or skills differ from the source", () => {
    const dir = mkdtempSync(join(tmpdir(), "ab-pack-"));
    const src = join(dir, "src");
    const pack = join(dir, "pack");
    for (const d of [src, pack]) {
      mkdirSync(join(d, "hooks"), { recursive: true });
      mkdirSync(join(d, "skills", "prism"), { recursive: true });
      writeFileSync(join(d, "hooks", "prism-hook.mjs"), "new");
    }
    assert.deepEqual(stalePackFiles(src, pack), []);
    writeFileSync(join(pack, "hooks", "prism-hook.mjs"), "old");
    mkdirSync(join(pack, "skills", "prism-lens"));
    assert.deepEqual(stalePackFiles(src, pack), [
      "hooks/prism-hook.mjs",
      "skills/prism-lens",
    ]);
  });

  it("sums every opencode step and counts Prism tool calls", () => {
    const out = [
      JSON.stringify({ type: "step_start", sessionID: "ses_1" }),
      "not json",
      JSON.stringify({
        type: "tool_use",
        part: { tool: "prism_prepare_change" },
      }),
      JSON.stringify({ type: "tool_use", part: { tool: "read" } }),
      JSON.stringify({
        type: "step_finish",
        part: {
          cost: 0.01,
          tokens: {
            input: 10,
            output: 5,
            reasoning: 1,
            cache: { read: 100, write: 20 },
          },
        },
      }),
      JSON.stringify({
        type: "step_finish",
        part: {
          cost: 0.02,
          tokens: { input: 3, output: 2, cache: { read: 50, write: 0 } },
        },
      }),
    ].join("\n");
    const { usage, sessionId, prismCalls } = opencodeUsage(out);
    assert.equal(sessionId, "ses_1");
    assert.equal(prismCalls, 1);
    assert.deepEqual(
      {
        input: usage.input,
        output: usage.output,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
      },
      { input: 13, output: 8, cacheRead: 150, cacheWrite: 20 },
    );
    assert.ok(Math.abs((usage.costUsd ?? 0) - 0.03) < 1e-9);
  });

  it("finds a provider key only by name, and none in an empty env", () => {
    const empty = mkdtempSync(join(tmpdir(), "ab-oc-"));
    assert.equal(opencodeKey({ OPENAI_API_KEY: "x" }, empty), "OPENAI_API_KEY");
    assert.equal(opencodeKey({}, empty), null);
    mkdirSync(join(empty, "opencode"));
    writeFileSync(join(empty, "opencode", "auth.json"), "{}");
    assert.equal(opencodeKey({}, empty), "auth.json");
  });

  it("still stops the whole run on a host usage limit", () => {
    assert.equal(
      hostStop(
        JSON.stringify({
          is_error: true,
          result: "Claude usage limit reached",
        }),
        "",
        1,
      ),
      "usage limit",
    );
    // Claude Code's subscription wording (2026-10-16 run: 27 sessions lost).
    assert.equal(
      hostStop(
        JSON.stringify({
          is_error: true,
          result:
            "You've hit your session limit · resets 5:20am (Asia/Calcutta)",
        }),
        "",
        1,
      ),
      "usage limit",
    );
    assert.equal(
      hostStop(
        JSON.stringify({ is_error: false, result: "rate limit docs" }),
        "",
        0,
      ),
      null,
    );
  });
});

describe("round 2 harness (quality)", async () => {
  const q = await import("./ab-quality.ts");
  const ab = await import("./agent-ab.ts");

  it("runs only the task's test files (hono had no lockfile)", () => {
    assert.deepEqual(
      ab.testCommand("npx", [
        "exec",
        "vp",
        "test",
        "--run",
        "src/jsx/utils.test.ts",
      ]),
      ["npx", ["vp", "test", "--run", "src/jsx/utils.test.ts"]],
    );
    assert.deepEqual(
      ab.testCommand("yarn", ["exec", "vitest", "run", "a.spec.ts"]),
      ["corepack", ["yarn", "exec", "vitest", "run", "a.spec.ts"]],
    );
  });

  it("denies reads of the notes, other checkouts and the token", () => {
    const deny = JSON.parse(
      ab.sandboxSettings("/tmp/prism-ab/repos/hono", "/Users/me"),
    ).permissions.deny as string[];
    assert.ok(deny.some((d) => d.includes("/plans/**")));
    assert.ok(
      deny.some((d) => d === "Read(//tmp/prism-ab/repos/es-toolkit/**)"),
    );
    assert.ok(
      deny.some(
        (d) => d === "Read(//private/tmp/prism-ab/repos/es-toolkit/**)",
      ),
    );
    assert.ok(deny.includes("Read(//Users/me/.prism-ab-token)"));
    assert.ok(!deny.some((d) => d.includes("repos/hono")));
    assert.ok(!deny.some((d) => d.includes("/packages/")));
    assert.ok(deny.includes("WebFetch") && deny.includes("WebSearch"));
  });

  it("keeps only the checkout and the toolchain readable, Bash sandboxed with no network", () => {
    const root = mkdtempSync(join(tmpdir(), "ab-home-"));
    for (const d of [
      ".nvm",
      ".bun",
      ".yarn/berry/cache",
      ".yarn/other",
      "portfolio",
      "Documents",
    ])
      mkdirSync(join(root, d), { recursive: true });
    const settings = JSON.parse(
      ab.sandboxSettings(
        "/tmp/prism-ab/repos/hono",
        root,
        "/tmp/prism-ab/home",
      ),
    );
    const deny = settings.permissions.deny as string[];
    assert.ok(deny.includes(`Read(/${join(root, "portfolio")}/**)`));
    assert.ok(deny.includes(`Read(/${join(root, "Documents")}/**)`));
    assert.ok(!deny.some((d) => d.includes(join(root, ".nvm"))));
    // Yarn PnP packages load from the global cache; the rest of ~/.yarn stays shut.
    assert.ok(!deny.some((d) => d.includes(join(root, ".yarn/berry"))));
    assert.ok(deny.includes(`Read(/${join(root, ".yarn/other")}/**)`));
    const sb = settings.sandbox;
    assert.equal(sb.enabled, true);
    assert.equal(sb.allowUnsandboxedCommands, false);
    assert.ok(sb.filesystem.denyRead.includes(root));
    assert.ok(
      sb.filesystem.allowRead.includes("/private/tmp/prism-ab/repos/hono"),
    );
    assert.ok(
      sb.filesystem.allowRead.includes(join(root, ".yarn/berry/cache")),
    );
    assert.deepEqual(sb.network.allowedDomains, []);
    assert.equal(sb.network.strictAllowlist, true);
  });

  it("names a new session up front, so a timed-out turn still has a transcript", () => {
    const fresh = ab.claudeArgs(
      "A",
      "fix it",
      "/tmp/prism-ab/repos/hono",
      undefined,
      "id-1",
    );
    assert.equal(fresh[fresh.indexOf("--session-id") + 1], "id-1");
    const resumed = ab.claudeArgs(
      "A",
      "and this",
      "/tmp/prism-ab/repos/hono",
      "id-1",
      "id-2",
    );
    assert.ok(!resumed.includes("--session-id"));
    assert.equal(resumed[resumed.indexOf("--resume") + 1], "id-1");
  });

  it("allBut keeps a nested path and what leads to it", () => {
    const root = mkdtempSync(join(tmpdir(), "ab-allbut-"));
    for (const d of ["a/keep", "a/drop", "b"])
      mkdirSync(join(root, d), { recursive: true });
    assert.deepEqual(
      ab.allBut(root, [join(root, "a/keep")]).sort(),
      [join(root, "a/drop"), join(root, "b")].sort(),
    );
  });

  it("counts source lines of a diff and where they were added", () => {
    const patch = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -10,3 +10,4 @@",
      " keep",
      "-old",
      "+new",
      "+more",
      " keep",
      "diff --git a/src/a.test.ts b/src/a.test.ts",
      "--- a/src/a.test.ts",
      "+++ b/src/a.test.ts",
      "@@ -1 +1 @@",
      "+test only",
      "diff --git a/src/n.ts b/src/n.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/n.ts",
      "@@ -0,0 +1 @@",
      "+export const n = 1;",
    ].join("\n");
    const s = q.diffStats(patch);
    assert.equal(s.added, 3);
    assert.equal(s.removed, 1);
    assert.equal(s.files, 2);
    assert.equal(s.newFiles, 1);
    assert.deepEqual(s.addedLines["src/a.ts"], [11, 12]);
  });

  it("parses findings and scores them against planted lines", () => {
    const text = [
      "Here is what I found:",
      "- `src/compat/math/meanBy.ts:41`: divides by length - 1",
      "1. src/compat/math/meanBy.ts:30 — duplicates isNil",
      "- **src/other.ts:5** nitpick",
      "No path here.",
    ].join("\n");
    const findings = q.parseFindings(text);
    assert.equal(findings.length, 3);
    const seed = (id: string, same?: string) => ({
      id,
      file: "src/compat/math/meanBy.ts",
      find: "",
      replace: "",
      kind: "bug",
      issue: "",
      ...(same ? { same } : {}),
    });
    const score = q.scoreReview(findings, [
      { seed: seed("divisor"), span: [40, 40] },
      { seed: seed("copy"), span: [28, 28] },
      { seed: seed("copy-def", "copy"), span: [24, 26] },
      { seed: seed("missed-one"), span: [90, 90] },
    ]);
    assert.deepEqual(score.found.sort(), ["copy", "divisor"]);
    assert.deepEqual(score.missed, ["missed-one"]);
    assert.equal(score.hits, 2);
    assert.equal(score.extra[0]?.file, "src/other.ts");
    assert.deepEqual(
      q.seedSpan("a\nb\nfunction x() {\n  y\n}\n", {
        replace: "function x() {\n  y\n}",
      } as never),
      [3, 5],
    );
  });

  it("accepts only a well-formed blind grade", () => {
    const ok = q.parseGrade(
      'Sure. {"X":{"correctness":5,"minimalism":4,"style":5},"Y":{"correctness":3,"minimalism":2,"style":4},"better":"X","why":"smaller"}',
    );
    assert.equal(ok?.better, "X");
    assert.equal(
      q.parseGrade('{"X":{"correctness":9},"Y":{},"better":"X"}'),
      null,
    );
    assert.deepEqual(q.parseValid('{"valid":[true,false]}', 2), [true, false]);
    assert.equal(q.parseValid('{"valid":[true]}', 2), null);
    // The order is fixed per key, so a re-grade shows the same X/Y.
    assert.equal(q.coin("pair:small:t:1"), q.coin("pair:small:t:1"));
    const prompt = q.gradePrompt({ task: "t", reference: "r", x: "x", y: "y" });
    assert.ok(!/prism|arm a|arm b/i.test(prompt));
  });

  it("scores the last reply that lists findings, not a closing remark", () => {
    const review =
      "- src/a.ts:3: divides by length - 1\n- src/b.ts:9: unused option";
    const found = q.reviewFindings(
      [review, "Nothing changed. I only reviewed."],
      "Nothing changed. I only reviewed.",
    );
    assert.deepEqual(
      found.map((f) => `${f.file}:${f.line}`),
      ["src/a.ts:3", "src/b.ts:9"],
    );
    assert.deepEqual(q.reviewFindings([], "No problems found."), []);
  });

  it("treats the checkout's /private path and the bun toolchain as inside", () => {
    const audit = q.auditCalls(
      [
        {
          name: "Bash",
          input: { command: "cd /private/tmp/prism-ab/repos/hono && ls" },
        },
        {
          name: "Read",
          input: { file_path: "/private/tmp/prism-ab/repos/hono/src/a.ts" },
        },
        { name: "Bash", input: { command: "/Users/me/.bun/bin/bun test x" } },
        {
          name: "Read",
          input: { file_path: "/private/tmp/prism-ab/repos/es-toolkit/a.ts" },
        },
      ],
      "/tmp/prism-ab/repos/hono",
    );
    assert.deepEqual(audit.outside, [
      "/private/tmp/prism-ab/repos/es-toolkit/a.ts",
    ]);
  });

  it("flags a history read only when it can reach past the checkout's own past", () => {
    const visible = (sha: string) =>
      sha.startsWith("7002dae6") || sha.startsWith("e62aa15f");
    const history = [
      "cd /x; git show 7002dae6 | head -60; yarn vitest run a",
      "cd /x; git show e62aa15f -- src/a.ts; cat b",
      "cd /x; git show 3433044c",
      "git log --all --oneline | head -3",
      "git show e62aa15f; git fsck --lost-found",
    ];
    assert.deepEqual(q.leakingHistory(history, visible), [
      "cd /x; git show 3433044c",
      "git log --all --oneline | head -3",
      "git show e62aa15f; git fsck --lost-found",
    ]);
  });

  it("audits reads outside the checkout and peeks at history", () => {
    const audit = q.auditCalls(
      [
        {
          name: "Read",
          input: { file_path: "/tmp/prism-ab/repos/hono/src/a.ts" },
        },
        {
          name: "Read",
          input: { file_path: "/tmp/prism-ab/repos/es-toolkit/src/b.ts" },
        },
        { name: "Bash", input: { command: "git log --all --oneline | head" } },
        {
          name: "Bash",
          input: { command: "cat /Users/me/Prism/plans/notes/x.md" },
        },
        {
          name: "Bash",
          input: { command: "ls node_modules/.bin && git log -3" },
        },
        {
          name: "Grep",
          input: {
            pattern: "x",
            path: "/Users/me/.nvm/versions/node/v24/lib/node_modules/x/",
          },
        },
      ],
      "/private/tmp/prism-ab/repos/hono",
    );
    assert.deepEqual(audit.outside, [
      "/tmp/prism-ab/repos/es-toolkit/src/b.ts",
      "/Users/me/Prism/plans/notes/x.md",
    ]);
    assert.equal(audit.history.length, 1);
  });

  it("splits a shell command for replay, quotes kept", () => {
    assert.deepEqual(
      ab.shellSegments(
        "cd /r; sed -i '' 's/a|b;c/d/' src/u.ts && grep -n 'x|y' src/u.ts | head",
      ),
      [
        "cd /r",
        "sed -i '' 's/a|b;c/d/' src/u.ts",
        "grep -n 'x|y' src/u.ts",
        "head",
      ],
    );
  });

  it("finds the repo's own style checks", () => {
    assert.equal(
      q.styleCommands({
        scripts: { lint: "vp lint src", format: "vp fmt --check src" },
      }).length,
      2,
    );
    const es = q.styleCommands({
      devDependencies: { eslint: "9", prettier: "3" },
    });
    assert.deepEqual(
      es.map((c) => c("a.ts")[0]),
      ["eslint", "prettier"],
    );
    assert.equal(q.styleCommands({}).length, 0);
  });
});

describe("cross-tool hosts", () => {
  it("reads the agent CLI's stream: session, usage, tool and Prism calls, replies", () => {
    const out = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s-1" }),
      JSON.stringify({
        type: "tool_call",
        subtype: "started",
        tool_call: { mcpToolCall: { args: { name: "prism_prepare" } } },
      }),
      JSON.stringify({
        type: "tool_call",
        subtype: "completed",
        tool_call: { mcpToolCall: { args: { name: "prism_prepare" } } },
      }),
      JSON.stringify({
        type: "tool_call",
        subtype: "started",
        tool_call: { getMcpToolsToolCall: { args: { server: "prism" } } },
      }),
      JSON.stringify({
        type: "tool_call",
        subtype: "started",
        tool_call: { readToolCall: { args: { path: "a.ts" } } },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "- a.ts:3: off by one" }] },
      }),
      "not json",
      JSON.stringify({
        type: "result",
        result: "done",
        session_id: "s-1",
        usage: {
          inputTokens: 100,
          outputTokens: 7,
          cacheReadTokens: 50,
          cacheWriteTokens: 2,
        },
      }),
    ].join("\n");
    const a = agentUsage(out);
    assert.equal(a.sessionId, "s-1");
    assert.equal(a.toolCalls, 3);
    assert.equal(a.prismCalls, 1);
    assert.deepEqual(a.replies, ["- a.ts:3: off by one"]);
    assert.equal(a.result, "done");
    assert.deepEqual(
      [
        a.usage.input,
        a.usage.output,
        a.usage.cacheRead,
        a.usage.cacheWrite,
        a.usage.costUsd,
      ],
      [100, 7, 50, 2, null],
    );
  });

  it("names the checkout and resumes follow-ups on each host's own flags", () => {
    assert.deepEqual(agentArgs("p", "/w", "s-1").slice(-5), [
      "--workspace",
      "/w",
      "--resume",
      "s-1",
      "p",
    ]);
    assert.ok(!agentArgs("p", "/w").includes("--resume"));
    assert.ok(agentArgs("p", "/w").includes("--trust"));
    assert.deepEqual(opencodeArgs("p", "/w", "ses_1").slice(-5), [
      "--dir",
      "/w",
      "--session",
      "ses_1",
      "p",
    ]);
    assert.ok(!opencodeArgs("p", "/w").includes("--session"));
  });

  it("collects opencode's text parts for review scoring", () => {
    const out = [
      JSON.stringify({ type: "text", part: { text: "- x.ts:1: bad" } }),
      JSON.stringify({ type: "step_finish", part: { tokens: { input: 1 } } }),
      JSON.stringify({ type: "text", part: { text: "  " } }),
    ].join("\n");
    assert.deepEqual(opencodeReplies(out), ["- x.ts:1: bad"]);
  });

  it("denies opencode web fetches and outside paths in both arms", () => {
    assert.deepEqual(OPENCODE_PERMISSION, {
      webfetch: "deny",
      external_directory: "deny",
    });
  });

  it("gives agent arm A a project Prism entry that never starts, and keeps task files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ab-agent-"));
    mkdirSync(join(dir, ".git", "info"), { recursive: true });
    mkdirSync(join(dir, ".cursor", "skills", "x"), { recursive: true });
    writeFileSync(join(dir, ".cursor", "skills", "x", "SKILL.md"), "skill");
    await agentPrepare(dir, "A");
    assert.equal(
      readFileSync(join(dir, ".cursor", "mcp.json"), "utf8"),
      AGENT_NO_PRISM,
    );
    assert.equal(
      readFileSync(join(dir, ".cursor", "skills", "x", "SKILL.md"), "utf8"),
      "skill",
    );
    assert.equal(
      readFileSync(join(dir, ".claude", "settings.local.json"), "utf8"),
      AGENT_NO_CLAUDE_PLUGIN,
    );
    const exclude = readFileSync(join(dir, ".git", "info", "exclude"), "utf8");
    assert.match(exclude, /^\.cursor\/$/m);
    assert.match(exclude, /^\.claude\/settings\.local\.json$/m);
    await agentPrepare(dir, "A");
    assert.equal(
      readFileSync(join(dir, ".git", "info", "exclude"), "utf8"),
      exclude,
    );
  });
});

describe("prismBusy", () => {
  it("is busy while checks are pending or a baseline has files put back", () => {
    const home = mkdtempSync(join(tmpdir(), "ab-settle-"));
    assert.equal(prismBusy(home), false);
    const receipts = join(home, "workspaces", "w1", "receipts");
    mkdirSync(join(receipts, "baseline-restore"), { recursive: true });
    writeFileSync(
      join(receipts, "r1.json"),
      JSON.stringify({ checksState: "done" }),
    );
    assert.equal(prismBusy(home), false);
    writeFileSync(
      join(receipts, "r2.json"),
      JSON.stringify({ checksState: "pending" }),
    );
    assert.equal(prismBusy(home), true);
    writeFileSync(
      join(receipts, "r2.json"),
      JSON.stringify({ checksState: "done" }),
    );
    writeFileSync(join(receipts, "baseline-restore", "manifest.json"), "{}");
    assert.equal(prismBusy(home), true);
  });
});

describe("wanted", () => {
  it("keeps every session without --only and only the named ones with it", () => {
    assert.equal(wanted(undefined, "t1", "bigger", "B"), true);
    const only = "t1:bigger:B,t2:review:L";
    assert.equal(wanted(only, "t1", "bigger", "B"), true);
    assert.equal(wanted(only, "t1", "bigger", "A"), false);
    assert.equal(wanted(only, "t2", "review", "L"), true);
    assert.equal(wanted(only, "t2", "followup", "L"), false);
  });
});
