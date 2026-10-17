/**
 * Round 2 feature probes: each Prism feature, auto-triggered and invoked, on
 * one host, scored from what the agent did (tools called, files changed,
 * tests run by the harness), never from what it says it did.
 *
 *   PRISM_AB_WORK=… PRISM_HOME=… node --experimental-strip-types \
 *     scripts/bench/feature-probes.ts --host claude|agent|opencode [--reps 2]
 *
 * Probes: habit (invoked / auto), custom skill (invoked / auto), custom lens
 * (invoked / trigger phrase), QA lens test-writing (invoked / auto) on a
 * planted bug whose spec was trimmed so no test reaches it.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentUsage,
  type Arm,
  assistantReplies,
  commitAs,
  git,
  hideHistory,
  hostSession,
  hostStop,
  settlePrism,
  invocationUsage,
  opencodeReplies,
  resultText,
  sumTokens,
  testsResult,
  transcriptPath,
} from "./agent-ab.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOST = (() => {
  const i = process.argv.indexOf("--host");
  const v = i >= 0 ? process.argv[i + 1] : "claude";
  return v === "agent" || v === "opencode" ? v : "claude";
})();
const REPS = Number(
  process.argv.includes("--reps")
    ? process.argv[process.argv.indexOf("--reps") + 1]
    : 2,
);
const WORK = process.env.PRISM_AB_WORK ?? "";
const PRISM_HOME = process.env.PRISM_HOME ?? "";
if (!WORK || !PRISM_HOME) throw new Error("set PRISM_AB_WORK and PRISM_HOME");
const DIR = join(WORK, "repos", "es-toolkit");
/** The es-toolkit commit whose installed modules the checkout already has. */
const REV = "827b92f7979cb53c397240e19249ce6dfb19bad8";
const OUT = join(
  repoRoot,
  // One file per round (PRISM_AB_TAG, default r2) so a re-run never mixes in.
  `plans/notes/benchmark-real-agents/features-${process.env.PRISM_AB_TAG ?? "r2"}-${HOST}.jsonl`,
);
const CLI = join(repoRoot, "packages/cli/dist/cli.js");

function prism(args: string[]): string {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: DIR,
    env: { ...process.env, PRISM_HOME },
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw new Error(`prism ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return r.stdout;
}

function reset(): void {
  // A test run's coverage writer can outlive the run; clear it first.
  // maxRetries covers a writer that is still adding files while it is removed.
  rmSync(join(DIR, "coverage"), {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  });
  git(DIR, ["checkout", "-q", "-f", "--detach", REV]);
  git(DIR, [
    "clean",
    "-fdx",
    "-e",
    "node_modules",
    "-e",
    ".yarn",
    "-e",
    ".pnp.cjs",
    "-e",
    ".pnp.loader.mjs",
  ]);
}

type Seen = {
  tools: string[];
  replies: string[];
  text: string;
  tokens: number;
};

/** Tool names and replies from one session, per host. */
function seen(stdout: string, sessionId: string): Seen {
  const tokens = sumTokens(invocationUsage(stdout).usage);
  if (HOST === "agent") {
    const a = agentUsage(stdout);
    const tools: string[] = [];
    for (const line of stdout.split("\n")) {
      try {
        const e = JSON.parse(line) as {
          type?: string;
          subtype?: string;
          tool_call?: Record<string, { args?: { name?: string } }>;
        };
        if (e.type !== "tool_call" || e.subtype !== "started") continue;
        const [kind, body] = Object.entries(e.tool_call ?? {})[0] ?? [];
        tools.push(
          kind === "mcpToolCall" ? String(body?.args?.name) : String(kind),
        );
      } catch {
        /* not an event */
      }
    }
    return { tools, replies: [...a.replies, a.result], text: stdout, tokens };
  }
  if (HOST === "opencode") {
    const tools: string[] = [];
    for (const line of stdout.split("\n")) {
      try {
        const e = JSON.parse(line) as {
          type?: string;
          part?: { tool?: string };
        };
        if (e.type === "tool_use" && e.part?.tool) tools.push(e.part.tool);
      } catch {
        /* log line */
      }
    }
    return { tools, replies: opencodeReplies(stdout), text: stdout, tokens };
  }
  const path = transcriptPath(DIR, sessionId);
  const text = path && existsSync(path) ? readFileSync(path, "utf8") : "";
  const tools: string[] = [];
  for (const line of text.split("\n")) {
    try {
      const row = JSON.parse(line) as {
        type?: string;
        message?: { content?: { type?: string; name?: string }[] };
      };
      if (row.type !== "assistant" || !Array.isArray(row.message?.content))
        continue;
      for (const c of row.message.content)
        if (c.type === "tool_use" && c.name) tools.push(c.name);
    } catch {
      /* partial line */
    }
  }
  return {
    tools,
    replies: [...assistantReplies(path), resultText(stdout)],
    text,
    tokens,
  };
}

const calledPrism = (s: Seen, name: string) =>
  s.tools.some((t) => /prism/i.test(t) && t.toLowerCase().includes(name));

type Check = Record<string, boolean>;
type Probe = {
  id: string;
  feature: string;
  trigger: "invoked" | "auto";
  arms: Arm[];
  setup: () => void;
  prompt: string;
  score: (s: Seen) => Check;
};

// ---------------------------------------------------------------- habit

const HABIT = "repo pulse";
function habitSetup(): void {
  reset();
  try {
    prism(["habit", "remove", HABIT]);
  } catch {
    /* none yet */
  }
  prism([
    "habit",
    "add",
    HABIT,
    "--output",
    "checklist",
    "--description",
    "Quick state of this repository",
    "--step",
    "git: list the subjects of the last 3 commits",
    "--step",
    "shell: count the .ts files in src/array, spec files excluded",
  ]);
}
function habitScore(s: Seen): Check {
  const subjects = git(DIR, ["log", "-3", "--format=%s"]).trim().split("\n");
  const count = git(DIR, ["ls-files", "src/array/*.ts"])
    .split("\n")
    .filter((p) => p && !p.endsWith(".spec.ts")).length;
  // Markdown is not content: `fix(x)`: y and fix(x): y are the same subject.
  const plain = (t: string) => t.replace(/[`*_]/g, "").replace(/\s+/g, " ");
  const reply = plain(s.replies.join("\n"));
  return {
    calledHabits: calledPrism(s, "habit"),
    allThreeSubjects: subjects.every((x) =>
      reply.includes(plain(x).slice(0, 40)),
    ),
    rightCount: new RegExp(`\\b${count}\\b`).test(reply),
  };
}

// ---------------------------------------------------------------- custom skill

const SKILL = `---
name: safe-change
description: Use when the user asks whether changing a function or its signature is safe.
---

1. Call Prism's \`blast_radius\` on the symbol.
2. Reply with exactly these lines:
   Dependents: <number of files that depend on it>
   then one dependent file path per line,
   then \`Verdict: contained\` or \`Verdict: far-reaching\`.
`;
function skillSetup(): void {
  reset();
  for (const d of [".claude", ".cursor"]) {
    const path = join(DIR, d, "skills", "safe-change", "SKILL.md");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, SKILL);
  }
  appendFileSync(
    join(DIR, ".git", "info", "exclude"),
    "\n.claude/\n.cursor/skills/\n",
  );
}
function skillScore(s: Seen): Check {
  const reply = s.replies.join("\n");
  // Truth: non-test files that import the chunk module.
  const importers = git(DIR, [
    "grep",
    "-l",
    "-E",
    "from '[./]+(array/)?chunk(\\.ts)?'",
    "--",
    "src",
  ])
    .split("\n")
    .filter((p) => p && !p.endsWith(".spec.ts") && p !== "src/array/chunk.ts");
  const listed = importers.filter((p) => reply.includes(p));
  return {
    calledBlastRadius: calledPrism(s, "blast"),
    followedFormat:
      /Dependents:\s*\d+/.test(reply) &&
      /Verdict:\s*(contained|far-reaching)/i.test(reply),
    listedHalfOfImporters:
      importers.length === 0 || listed.length * 2 >= importers.length,
  };
}

// ---------------------------------------------------------------- custom lens

const LENS_ROLE = "Performance reviewer for repeated work inside loops";
function lensSetup(): void {
  reset();
  try {
    prism(["lens", "remove", "perf"]);
  } catch {
    /* none yet */
  }
  prism([
    "lens",
    "add",
    "perf",
    "--name",
    "Perf",
    "--role",
    LENS_ROLE,
    "--focus",
    "Find work repeated inside loops and scans that grow quadratically with the input.",
    "--checklist",
    "Each finding names the loop and the input size that makes it slow.",
    "--trigger",
    "perf pass",
  ]);
}
function lensScore(s: Seen): Check {
  const reply = s.replies.join("\n");
  return {
    // The role text is only in context if Prism injected the lens.
    lensReachedAgent: s.text.includes(LENS_ROLE),
    namedALoop: /\b(loop|for|while|includes|indexOf|filter|some)\b/i.test(
      reply,
    ),
    noEdits: git(DIR, ["status", "--porcelain", "--", "src"]).trim() === "",
  };
}

// ---------------------------------------------------------------- QA lens

const SPEC = "src/array/chunk.spec.ts";
const SRC = "src/array/chunk.ts";
let goodSource = "";
function qaSetup(): void {
  reset();
  goodSource = readFileSync(join(DIR, SRC), "utf8");
  writeFileSync(
    join(DIR, SRC),
    goodSource.replace(
      "Math.ceil(arr.length / size)",
      "Math.floor(arr.length / size)",
    ),
  );
  // Keep only the size-validation test, so no test reaches the planted bug.
  writeFileSync(
    join(DIR, SPEC),
    `import { describe, expect, it } from 'vitest';
import { chunk } from './chunk';

describe('chunk', () => {
  it('should throw if size is not a positive integer', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow();
  });
});
`,
  );
  git(DIR, ["add", "--", SRC, SPEC]);
  commitAs(DIR, "Change under review", [SRC, SPEC]);
  hideHistory(DIR);
}
const VITEST = ["exec", "vitest", "run", "--coverage.enabled=false", SPEC];
function qaScore(s: Seen): Check {
  const reply = s.replies.join("\n");
  const sourceUntouched =
    git(DIR, ["diff", "--name-only", "HEAD", "--", SRC]).trim() === "";
  const specChanged =
    git(DIR, ["diff", "--name-only", "HEAD", "--", SPEC]).trim() !== "";
  const buggy = readFileSync(join(DIR, SRC), "utf8");
  const failsOnBug = specChanged && testsResult(DIR, VITEST) === "fail";
  writeFileSync(join(DIR, SRC), goodSource);
  const passesOnFix = specChanged && testsResult(DIR, VITEST) === "pass";
  writeFileSync(join(DIR, SRC), buggy);
  return {
    foundBug: /floor/i.test(reply),
    namedSpec: reply.includes("chunk.spec.ts"),
    sourceUntouched,
    testFailsOnBug: failsOnBug,
    testPassesOnFix: passesOnFix,
  };
}

const QA_ASK =
  "Do not change src/array/chunk.ts. Add the one test to src/array/chunk.spec.ts that fails because of the bug, and stop.";

const PROBES: Probe[] = [
  {
    id: "habit-invoked",
    feature: "custom habit",
    trigger: "invoked",
    arms: ["A", "B"],
    setup: habitSetup,
    prompt: `Run my ${HABIT} habit.`,
    score: habitScore,
  },
  {
    id: "habit-auto",
    feature: "custom habit",
    trigger: "auto",
    arms: ["A", "B"],
    setup: habitSetup,
    prompt: `Give me my ${HABIT}.`,
    score: habitScore,
  },
  {
    id: "skill-invoked",
    feature: "custom skill",
    trigger: "invoked",
    arms: ["B"],
    setup: skillSetup,
    prompt:
      "Use the safe-change skill: is it safe to change the signature of `chunk` in src/array/chunk.ts? Do not edit any file.",
    score: skillScore,
  },
  {
    id: "skill-auto",
    feature: "custom skill",
    trigger: "auto",
    arms: ["B"],
    setup: skillSetup,
    prompt:
      "Is it safe to change the signature of `chunk` in src/array/chunk.ts? Do not edit any file.",
    score: skillScore,
  },
  {
    id: "lens-invoked",
    feature: "custom lens",
    trigger: "invoked",
    arms: ["B"],
    setup: lensSetup,
    prompt:
      "Use the Perf lens on src/array/uniqBy.ts and src/array/intersectionBy.ts. Do not edit any file.",
    score: lensScore,
  },
  {
    id: "lens-auto",
    feature: "custom lens",
    trigger: "auto",
    arms: ["B"],
    setup: lensSetup,
    prompt:
      "Do a perf pass on src/array/uniqBy.ts and src/array/intersectionBy.ts. Do not edit any file.",
    score: lensScore,
  },
  {
    id: "qa-invoked",
    feature: "QA lens tests",
    trigger: "invoked",
    arms: ["A", "B"],
    setup: qaSetup,
    prompt: `Use Prism's QA lens. Find the bug in src/array/chunk.ts. ${QA_ASK}`,
    score: qaScore,
  },
  {
    id: "qa-auto",
    feature: "QA lens tests",
    trigger: "auto",
    arms: ["A", "B"],
    setup: qaSetup,
    prompt: `Find bugs in src/array/chunk.ts. ${QA_ASK}`,
    score: qaScore,
  },
];

if (process.argv.includes("--rescore-habits")) {
  reset();
  const rows = readFileSync(OUT, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(
      (l) =>
        JSON.parse(l) as {
          feature: string;
          prismTools: string[];
          reply: string;
          checks: Check;
          pass: boolean;
        },
    );
  for (const row of rows) {
    if (row.feature !== "custom habit") continue;
    row.checks = habitScore({
      tools: row.prismTools,
      replies: [row.reply],
      text: "",
      tokens: 0,
    });
    row.pass = Object.values(row.checks).every(Boolean);
  }
  writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log("rescored habit rows");
  process.exit(0);
}

const done = new Set(
  existsSync(OUT)
    ? readFileSync(OUT, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const r = JSON.parse(l) as { id: string; arm: string; rep: number };
          return `${r.id}:${r.arm}:${r.rep}`;
        })
    : [],
);
const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]!.split(",")
  : null;
for (let rep = 1; rep <= REPS; rep += 1)
  for (const probe of PROBES) {
    if (only && !only.includes(probe.id)) continue;
    for (const arm of probe.arms) {
      if (done.has(`${probe.id}:${arm}:${rep}`)) continue;
      console.log(`${probe.id} arm ${arm} rep ${rep}`);
      probe.setup();
      const session = await hostSession(DIR, arm, probe.prompt);
      // A host that refused the session (usage limit, sign-in) is not a probe result.
      const stop = hostStop(session.stdout, session.stderr, session.status);
      if (stop) {
        console.log(`  host stop: ${stop}`);
        process.exit(3);
      }
      await settlePrism(arm);
      const s = seen(session.stdout, session.sessionId);
      // What the checkout looked like when scoring started (for a check that fails).
      const diag = {
        head: git(DIR, ["log", "-1", "--format=%h %an %s"]).trim(),
        status: git(DIR, ["status", "--porcelain"])
          .trim()
          .split("\n")
          .slice(0, 10),
      };
      const checks = probe.score(s);
      const row = {
        id: probe.id,
        feature: probe.feature,
        trigger: probe.trigger,
        host: HOST,
        arm,
        rep,
        at: new Date().toISOString(),
        durationMs: session.durationMs,
        timedOut: session.timedOut,
        exitCode: session.status,
        tokens: s.tokens,
        prismTools: s.tools.filter((t) => /prism/i.test(t)),
        toolCalls: s.tools.length,
        checks,
        pass: Object.values(checks).every(Boolean),
        sessionId: session.sessionId,
        diag,
        reply: s.replies.join("\n").slice(-1500),
      };
      appendFileSync(OUT, `${JSON.stringify(row)}\n`);
      console.log(
        `  ${row.pass ? "pass" : "fail"} ${JSON.stringify(checks)} ${Math.round(session.durationMs / 1000)}s`,
      );
    }
  }
