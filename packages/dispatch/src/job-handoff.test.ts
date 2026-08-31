/**
 * Durable handoff, checked summaries, and supervisor verification (ADR-0042).
 *
 * The regression these lock down: a shipped job reported `done` citing
 * `.prism/audit/` and a notes file, while the branch had zero commits and the
 * cited paths existed only as gitignored files in a worktree the user is
 * never told about. The work was real and unreachable.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  commitJobWork,
  committedJobPaths,
  defaultGitRunner,
  JOB_ARTIFACT_PATHS,
} from "./git.js";
import {
  auditCitedPaths,
  citedPaths,
  fabricationNote,
  stripWorktreePaths,
} from "./job-artifacts.js";
import { firstFailureLine, verifyJobWork } from "./job-verify.js";
import { composeJobResult } from "./run-state.js";

/** These suites shell out to real git, which is slow under a parallel run. */
const GIT_TIMEOUT_MS = 30_000;

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

async function repo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prism-handoff-"));
  temps.push(dir);
  const run = defaultGitRunner;
  await run(dir, ["init", "-b", "main"]);
  await run(dir, ["config", "user.email", "t@example.com"]);
  await run(dir, ["config", "user.name", "Test"]);
  await writeFile(join(dir, ".gitignore"), ".prism/\nnode_modules\n");
  await writeFile(join(dir, "seed.txt"), "seed\n");
  await run(dir, ["add", "-A"]);
  await run(dir, ["commit", "-m", "seed"]);
  // A real job runs on its own branch off the base, which is what makes
  // `base...HEAD` the right question to ask about its output.
  await run(dir, ["checkout", "-b", "dispatch/job"]);
  return dir;
}

describe("commitJobWork", { timeout: GIT_TIMEOUT_MS }, () => {
  it("commits edited source onto the job branch", async () => {
    const dir = await repo();
    await writeFile(join(dir, "seed.txt"), "edited\n");

    const commit = await commitJobWork(dir, { jobId: "AI-971", title: "Fix" });

    expect(commit.committed).toBe(true);
    expect(commit.sha).toBeTruthy();
    expect(commit.summary).toMatch(/1 file/);

    const log = await defaultGitRunner(dir, ["log", "--oneline", "-1"]);
    expect(log.stdout).toContain("dispatch(AI-971): Fix");
  });

  it("force-adds the notes artifact path even though .prism is ignored", async () => {
    const dir = await repo();
    await mkdir(join(dir, ".prism", "dispatch", "notes"), { recursive: true });
    await writeFile(
      join(dir, ".prism", "dispatch", "notes", "audit.md"),
      "# findings\n",
    );

    const commit = await commitJobWork(dir, {
      jobId: "audit",
      title: "Audit",
    });

    expect(commit.committed).toBe(true);
    const paths = await committedJobPaths(dir, "main");
    expect(paths).toContain(".prism/dispatch/notes/audit.md");
  });

  it("leaves other ignored .prism output out of the commit", async () => {
    const dir = await repo();
    await mkdir(join(dir, ".prism", "audit"), { recursive: true });
    await writeFile(join(dir, ".prism", "audit", "health.json"), "{}");
    await writeFile(join(dir, "seed.txt"), "edited\n");

    await commitJobWork(dir, { jobId: "j", title: "t" });

    const paths = await committedJobPaths(dir, "main");
    expect(paths).toContain("seed.txt");
    expect(paths).not.toContain(".prism/audit/health.json");
  });

  it("reports no commit when the run changed nothing", async () => {
    const dir = await repo();

    const commit = await commitJobWork(dir, { jobId: "j", title: "t" });

    expect(commit.committed).toBe(false);
    expect(commit.summary).toBe("");
  });

  it("does not count a node_modules symlink as work", async () => {
    const dir = await repo();
    await mkdir(join(dir, "node_modules"), { recursive: true });
    await writeFile(join(dir, "node_modules", "x.js"), "1");

    const commit = await commitJobWork(dir, { jobId: "j", title: "t" });

    expect(commit.committed).toBe(false);
  });

  it("only mentions the artifact allowlist under .prism", () => {
    expect(JOB_ARTIFACT_PATHS).toEqual([".prism/dispatch/notes"]);
  });
});

describe("citedPaths / auditCitedPaths", { timeout: GIT_TIMEOUT_MS }, () => {
  it("classifies a fabricated artifact as missing", async () => {
    const dir = await repo();

    const audit = await auditCitedPaths({
      text: "Reports are in `.prism/audit/` and the write-up is `.prism/dispatch/notes/x.md`.",
      worktreePath: dir,
      committedPaths: [],
    });

    expect(audit.missing).toContain(".prism/dispatch/notes/x.md");
    expect(audit.delivered).toEqual([]);
  });

  it("classifies a committed artifact as delivered", async () => {
    const dir = await repo();
    await mkdir(join(dir, ".prism", "dispatch", "notes"), { recursive: true });
    await writeFile(join(dir, ".prism", "dispatch", "notes", "a.md"), "x");

    const audit = await auditCitedPaths({
      text: "Wrote `.prism/dispatch/notes/a.md`.",
      worktreePath: dir,
      committedPaths: [".prism/dispatch/notes/a.md"],
    });

    expect(audit.delivered).toEqual([".prism/dispatch/notes/a.md"]);
    expect(audit.missing).toEqual([]);
  });

  it("flags an on-disk but uncommitted artifact as unreachable", async () => {
    const dir = await repo();
    await writeFile(join(dir, "stray.md"), "x");

    const audit = await auditCitedPaths({
      text: "See `stray.md`.",
      worktreePath: dir,
      committedPaths: [],
    });

    expect(audit.uncommitted).toEqual(["stray.md"]);
  });

  it("ignores commands and URLs", () => {
    const found = citedPaths(
      "Run `bun test` then read `https://example.com/a/b`.",
      "/tmp/x",
    );
    expect(found).toEqual([]);
  });

  it("names what was claimed but never written", () => {
    expect(
      fabricationNote({ delivered: [], uncommitted: [], missing: ["a.md"] }),
    ).toBe("It mentioned a.md, which was not written.");
    expect(
      fabricationNote({ delivered: [], uncommitted: [], missing: [] }),
    ).toBe("");
  });
});

describe("stripWorktreePaths", () => {
  it("removes the absolute worktree prefix the user cannot act on", () => {
    expect(
      stripWorktreePaths(
        "Edited /tmp/wt/src/a.ts and /tmp/wt/src/b.ts.",
        "/tmp/wt",
      ),
    ).toBe("Edited src/a.ts and src/b.ts.");
  });
});

describe("verifyJobWork", { timeout: GIT_TIMEOUT_MS }, () => {
  const steps = [
    { name: "typecheck", script: "typecheck" },
    { name: "test", script: "test" },
  ];

  it("passes when every allowlisted step passes", async () => {
    const dir = await repo();
    await writeFile(join(dir, "package.json"), "{}");

    const result = await verifyJobWork(dir, {
      steps,
      run: async () => ({ ok: true, output: "" }),
    });

    expect(result.status).toBe("passed");
    expect(result.detail).toContain("typecheck and test");
  });

  it("stops at the first failure and reports a reason", async () => {
    const dir = await repo();
    await writeFile(join(dir, "package.json"), "{}");
    const seen: string[] = [];

    const result = await verifyJobWork(dir, {
      steps,
      run: async (_cwd, script) => {
        seen.push(script);
        return { ok: false, output: "src/a.ts(3,1): error TS2345: nope" };
      },
    });

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("typecheck failed");
    expect(seen).toEqual(["typecheck"]);
  });

  it("skips when there is nothing to run", async () => {
    const dir = await repo();
    const result = await verifyJobWork(dir, { steps });
    expect(result.status).toBe("skipped");
  });

  it("never runs install or the prism CLI", async () => {
    const scripts = steps.map((step) => step.script);
    expect(scripts).not.toContain("install");
    expect(scripts.some((script) => script.includes("prism"))).toBe(false);
  });

  it("picks the first meaningful failure line", () => {
    expect(firstFailureLine("ok\n\nsrc/a.ts: error TS1: bad\nmore")).toBe(
      "src/a.ts: error TS1: bad",
    );
  });
});

describe("composeJobResult", () => {
  it("says so plainly when nothing reviewable was produced", () => {
    const text = composeJobResult({
      gitSummary: "",
      assistant: "Audit complete.",
      committed: false,
    });
    expect(text).toContain("Produced no reviewable change.");
  });

  it("does not hide a failing check behind done", () => {
    const text = composeJobResult({
      gitSummary: "2 files changed",
      assistant: "Refactored the runner.",
      committed: true,
      verification: "failed",
      verificationDetail: "typecheck failed — error TS2345",
    });
    expect(text).toContain("Checks failed");
    expect(text).toContain("TS2345");
  });

  it("carries the fabrication note into the summary", () => {
    const text = composeJobResult({
      gitSummary: "1 file changed",
      assistant: "Wrote the report.",
      committed: true,
      verification: "passed",
      verificationDetail: "typecheck and test passed.",
      fabricationNote:
        "It mentioned .prism/audit/x.json, which was not written.",
    });
    expect(text).toContain("was not written");
  });
});
