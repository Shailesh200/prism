#!/usr/bin/env node
/**
 * Replay benchmark (M-079 phase 1, ADR-0058 §7).
 *
 * Does Prism's stop check catch regressions that real changes shipped?
 *
 * Arm A, deterministic, no model:
 *   1. Mine regressions with SZZ-lite: for each later fix (or revert), blame the
 *      lines it changed; a commit that last touched them within 14 days is the
 *      regression. Reverts name the regression directly.
 *   2. Replay each regression as an uncommitted change on its parent and build
 *      the change receipt — the same code the stop hook runs.
 *   3. Re-run the same scoped checks on the clean parent. A check that fails
 *      after the change and passed before it is a catch; one that fails both
 *      times is environment noise and does not count.
 *   4. Control commits (never blamed by a fix) replayed the same way: an
 *      attributable failure there is a false alarm.
 *
 * Dev-time only. Clones public repos (network); no Core path gains a call.
 *
 *   node scripts/replay-benchmark.ts \
 *     --repos es-toolkit=https://github.com/toss/es-toolkit.git,... \
 *     --work /tmp/prism-bench --per-repo 6 --out plans/notes/benchmark/R0.json
 *
 * Requires `bun run build` first (imports the built receipt and checks).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const dist = (pkg: string, file: string) =>
  join(repoRoot, "packages", pkg, "dist", file);

type CheckResult = {
  name: string;
  status: "passed" | "failed" | "absent" | "interrupted";
  detail: string;
  durationMs: number;
};

type CaseKind = "regression" | "control";

type CaseResult = {
  repo: string;
  kind: CaseKind;
  commit: string;
  subject: string;
  fixedBy?: string;
  fixSubject?: string;
  fixFiles?: string[];
  touched: string[];
  testFiles: string[];
  testMode: string;
  verdict: string;
  checks: CheckResult[];
  baseline: CheckResult[];
  attributable: string[];
  flagsOnFixFiles: string[];
  flags: { path: string; kind: string; detail: string }[];
  notProven: number;
  receiptMs: number;
  outcome: "caught" | "missed" | "false-alarm" | "quiet" | "unrunnable";
  note?: string;
};

function arg(flag: string, fallback = ""): string {
  const i = process.argv.indexOf(flag);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith("--") ? next : fallback;
}

function git(cwd: string, args: string[], allowFail = false): string {
  const res = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64_000_000,
  });
  if (res.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")}: ${res.stderr}`);
  }
  return res.stdout ?? "";
}

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const isSource = (p: string) =>
  SOURCE.test(p) && !TEST.test(p) && !p.endsWith(".d.ts");

type Commit = { sha: string; time: number; subject: string; body: string };

function commitsInWindow(cwd: string, days: number): Commit[] {
  const out = git(cwd, [
    "log",
    "--no-merges",
    `--since=${days}.days`,
    "--format=%H%x1f%ct%x1f%s%x1f%b%x1e",
  ]);
  return out
    .split("\x1e")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [sha = "", time = "0", subject = "", body = ""] = row.split("\x1f");
      return { sha, time: Number(time), subject, body };
    });
}

function changedFiles(
  cwd: string,
  sha: string,
): { status: string; path: string }[] {
  return git(cwd, ["diff-tree", "--no-commit-id", "-r", "--name-status", sha])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status = "", ...rest] = line.split("\t");
      return { status: status[0] ?? "M", path: rest[rest.length - 1] ?? "" };
    });
}

const FIX = /^(fix|hotfix|revert)\b|\bfix(e[sd])?\b|\bregression\b|^Revert "/i;

type Candidate = {
  bad: string;
  fix: string;
  fixSubject: string;
  fixFiles: string[];
};

/** SZZ-lite: the commit that last touched the lines a fix changed. */
function mineRegressions(
  cwd: string,
  commits: Commit[],
  want: number,
  maxFixes = 150,
): Candidate[] {
  const byHash = new Map(commits.map((c) => [c.sha, c]));
  const out = new Map<string, Candidate>();
  const fixes = commits.filter((c) => FIX.test(c.subject)).slice(0, maxFixes);
  for (const fix of fixes) {
    if (out.size >= want * 2) break;
    const fixFiles = changedFiles(cwd, fix.sha)
      .filter((f) => f.status === "M" && isSource(f.path))
      .map((f) => f.path);
    if (fixFiles.length === 0 || fixFiles.length > 6) continue;

    const reverted = /This reverts commit ([0-9a-f]{40})/.exec(fix.body)?.[1];
    if (reverted && byHash.has(reverted)) {
      out.set(reverted, {
        bad: reverted,
        fix: fix.sha,
        fixSubject: fix.subject,
        fixFiles,
      });
      continue;
    }

    const blamed = new Map<string, number>();
    for (const file of fixFiles) {
      const diff = git(
        cwd,
        ["diff", "-U0", `${fix.sha}^`, fix.sha, "--", file],
        true,
      );
      for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? /gm)) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        if (count === 0) continue;
        const blame = git(
          cwd,
          [
            "blame",
            "-l",
            "-s",
            "-L",
            `${start},${start + count - 1}`,
            `${fix.sha}^`,
            "--",
            file,
          ],
          true,
        );
        for (const line of blame.split("\n")) {
          const sha = line.slice(0, 40).replace(/^\^/, "");
          if (/^[0-9a-f]{40}$/.test(sha))
            blamed.set(sha, (blamed.get(sha) ?? 0) + 1);
        }
      }
    }
    let best: Commit | undefined;
    for (const sha of blamed.keys()) {
      const c = byHash.get(sha);
      if (!c || sha === fix.sha) continue;
      if (fix.time - c.time > 14 * 86_400 || c.time > fix.time) continue;
      if (FIX.test(c.subject)) continue;
      if (!best || c.time > best.time) best = c;
    }
    if (best && !out.has(best.sha)) {
      out.set(best.sha, {
        bad: best.sha,
        fix: fix.sha,
        fixSubject: fix.subject,
        fixFiles,
      });
    }
  }
  return [...out.values()].filter((cand) => {
    const files = changedFiles(cwd, cand.bad);
    return files.length <= 12 && files.some((f) => isSource(f.path));
  });
}

function pickControls(
  cwd: string,
  commits: Commit[],
  exclude: Set<string>,
  count: number,
): Commit[] {
  const picked: Commit[] = [];
  // Deterministic stride, not random: a re-run picks the same controls.
  const pool = commits.filter(
    (c) => !exclude.has(c.sha) && !FIX.test(c.subject),
  );
  const stride = Math.max(1, Math.floor(pool.length / Math.max(1, count * 3)));
  for (let i = 0; i < pool.length && picked.length < count; i += stride) {
    const c = pool[i]!;
    const files = changedFiles(cwd, c.sha);
    if (files.length === 0 || files.length > 12) continue;
    if (!files.some((f) => isSource(f.path))) continue;
    picked.push(c);
  }
  return picked;
}

function install(cwd: string): void {
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
    packageManager?: string;
  };
  const run = (cmd: string, args: string[]) => {
    console.log(`  install: ${cmd} ${args.join(" ")}`);
    execFileSync(cmd, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, CI: "1", HUSKY: "0" },
    });
  };
  const tryRun = (cmd: string, args: string[]): boolean => {
    try {
      run(cmd, args);
      return true;
    } catch (error) {
      console.log(
        `  install failed (${cmd}): ${error instanceof Error ? error.message.slice(0, 180) : error}`,
      );
      return false;
    }
  };
  if (existsSync(join(cwd, "yarn.lock"))) {
    const yarnrc = existsSync(join(cwd, ".yarnrc.yml"))
      ? readFileSync(join(cwd, ".yarnrc.yml"), "utf8")
      : "";
    const yarnPath = /yarnPath:\s*(\S+)/.exec(yarnrc)?.[1];
    if (yarnPath) run("node", [join(cwd, yarnPath), "install", "--immutable"]);
    else run("npx", ["-y", "yarn@1", "install", "--frozen-lockfile"]);
  } else if (
    existsSync(join(cwd, "pnpm-lock.yaml")) &&
    !(pkg.packageManager ?? "").startsWith("nub@")
  ) {
    const version = /pnpm@(\d+)/.exec(pkg.packageManager ?? "")?.[1] ?? "9";
    if (
      !tryRun("npx", ["-y", `pnpm@${version}`, "install", "--frozen-lockfile"])
    ) {
      run("npm", ["ci", "--no-audit", "--no-fund"]);
    }
  } else if (
    existsSync(join(cwd, "bun.lock")) ||
    existsSync(join(cwd, "bun.lockb"))
  ) {
    run("bun", ["install", "--frozen-lockfile"]);
  } else {
    run("npm", ["ci", "--no-audit", "--no-fund"]);
  }
}

function resetTo(cwd: string, sha: string): void {
  git(cwd, ["checkout", "-q", "-f", "--detach", sha]);
  git(cwd, ["clean", "-fdq", "-e", "node_modules", "-e", "**/node_modules"]);
}

/** Apply `sha`'s change on top of its parent as uncommitted work. */
function applyAsDirty(cwd: string, sha: string): void {
  resetTo(cwd, `${sha}^`);
  for (const file of changedFiles(cwd, sha)) {
    if (file.status === "D") {
      git(cwd, ["rm", "-q", "--cached", "--", file.path], true);
      spawnSync("rm", ["-f", join(cwd, file.path)]);
    } else {
      git(cwd, ["checkout", sha, "--", file.path]);
    }
  }
  // Leave everything unstaged: the stop hook sees a working-tree session.
  git(cwd, ["reset", "-q"], true);
}

const CATCHING_STEP = /(^|: )(typecheck|test)$/;

async function main(): Promise<void> {
  const reposArg = arg("--repos");
  const work = resolve(arg("--work", "/tmp/prism-bench"));
  const perRepo = Number(arg("--per-repo", "6"));
  const windowDays = Number(arg("--window-days", "540"));
  const out = resolve(
    arg("--out", join(repoRoot, "plans/notes/benchmark/R0.json")),
  );
  if (!reposArg) throw new Error("--repos name=url,... is required");

  process.env.PRISM_HOME = join(work, "prism-home");
  mkdirSync(process.env.PRISM_HOME, { recursive: true });

  const { Prism } = (await import(
    dist("core", "index.js")
  )) as typeof import("../packages/core/src/index.ts");
  const { buildChangeReceipt } = (await import(
    dist("mcp-server", "safety/receipt.js")
  )) as typeof import("../packages/mcp-server/src/safety/receipt.ts");
  const { resolveScopedPlan, runCheckSteps, packageRootFor } = (await import(
    dist("checks", "index.js")
  )) as typeof import("../packages/checks/src/index.ts");

  const results: CaseResult[] = [];
  for (const spec of reposArg.split(",")) {
    const [name = "", url = ""] = spec.split("=");
    const clone = join(work, "repos", name);
    if (!existsSync(clone)) {
      mkdirSync(dirname(clone), { recursive: true });
      // Full clone: SZZ blames many old blobs, and a blobless clone fetches each.
      execFileSync("git", ["clone", "-q", url, clone], { stdio: "inherit" });
    }
    const commits = commitsInWindow(clone, windowDays);
    const candidates = mineRegressions(clone, commits, perRepo).slice(
      0,
      perRepo,
    );
    const exclude = new Set([
      ...candidates.map((c) => c.bad),
      ...candidates.map((c) => c.fix),
    ]);
    const controls = pickControls(clone, commits, exclude, candidates.length);
    console.log(
      `${name}: ${candidates.length} regressions, ${controls.length} controls`,
    );

    const wt = join(work, "wt", name);
    if (!existsSync(wt)) {
      git(clone, ["worktree", "add", "-q", "--detach", wt, "HEAD"]);
    }
    if (!existsSync(join(wt, "node_modules"))) {
      try {
        resetTo(wt, git(clone, ["rev-parse", "HEAD"]).trim());
        install(wt);
      } catch (error) {
        const note =
          error instanceof Error ? error.message.slice(0, 300) : String(error);
        console.log(
          `${name}: install failed, skipping (${note.slice(0, 160)})`,
        );
        results.push({
          repo: name,
          kind: "regression",
          commit: "install",
          subject: "install failed",
          touched: [],
          testFiles: [],
          testMode: "none",
          verdict: "clean",
          checks: [],
          baseline: [],
          attributable: [],
          flagsOnFixFiles: [],
          flags: [],
          notProven: 0,
          receiptMs: 0,
          outcome: "unrunnable",
          note,
        });
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(summarise(results), null, 2)}\n`);
        continue;
      }
    }

    const cases: { kind: CaseKind; sha: string; cand?: Candidate }[] = [
      ...candidates.map((cand) => ({
        kind: "regression" as const,
        sha: cand.bad,
        cand,
      })),
      ...controls.map((c) => ({ kind: "control" as const, sha: c.sha })),
    ];
    for (const item of cases) {
      const subject = git(clone, ["log", "-1", "--format=%s", item.sha]).trim();
      console.log(
        `  ${item.kind} ${item.sha.slice(0, 8)} ${subject.slice(0, 70)}`,
      );
      const base: Omit<CaseResult, "outcome"> = {
        repo: name,
        kind: item.kind,
        commit: item.sha,
        subject,
        ...(item.cand
          ? {
              fixedBy: item.cand.fix,
              fixSubject: item.cand.fixSubject,
              fixFiles: item.cand.fixFiles,
            }
          : {}),
        touched: [],
        testFiles: [],
        testMode: "none",
        verdict: "clean",
        checks: [],
        baseline: [],
        attributable: [],
        flagsOnFixFiles: [],
        flags: [],
        notProven: 0,
        receiptMs: 0,
      };
      try {
        applyAsDirty(wt, item.sha);
        const opened = Prism.create().openRepository(wt);
        if (!opened.ok) throw new Error(opened.error.message);
        const started = Date.now();
        const receipt = await buildChangeReceipt(opened.value, {});
        if (!receipt.ok) throw new Error(receipt.error.message);
        const r = receipt.value;
        base.touched = r.touched.files;
        base.testFiles = r.testFiles;
        base.testMode = r.testMode;
        base.verdict = r.verdict;
        base.checks = r.checks;
        base.flags = r.flags;
        base.notProven = r.notProven.length;
        base.receiptMs = Date.now() - started;
        base.flagsOnFixFiles = r.flags
          .filter((f) => item.cand?.fixFiles.includes(f.path))
          .map((f) => `${f.kind}:${f.path}`);

        // Same steps on the clean parent: what failed before the change is noise.
        resetTo(wt, `${item.sha}^`);
        const groups = new Map<string, string[]>();
        for (const p of r.touched.files) {
          const pkg = packageRootFor(wt, p);
          if (!groups.has(pkg)) groups.set(pkg, []);
        }
        for (const t of r.testFiles) {
          const pkg = packageRootFor(wt, t);
          const list = groups.get(pkg) ?? [];
          if (existsSync(join(wt, t)))
            list.push(pkg ? t.slice(pkg.length + 1) : t);
          groups.set(pkg, list);
        }
        for (const [pkg, tests] of [...groups.entries()].sort()) {
          const cwd = pkg ? join(wt, pkg) : wt;
          const scoped = await resolveScopedPlan(cwd, tests);
          for (const res of await runCheckSteps(cwd, scoped.plan.steps)) {
            base.baseline.push(
              pkg ? { ...res, name: `${pkg}: ${res.name}` } : res,
            );
          }
        }
        const passedBefore = new Set(
          base.baseline.filter((c) => c.status === "passed").map((c) => c.name),
        );
        base.attributable = r.checks
          .filter((c) => c.status === "failed" && passedBefore.has(c.name))
          .filter((c) => CATCHING_STEP.test(c.name))
          .map((c) => `${c.name}: ${c.detail}`);
        const ran = r.checks.some(
          (c) => c.status === "passed" || c.status === "failed",
        );
        // A high-severity flag on a file the later fix touched is a catch.
        // The same kind of flag on a control commit is a false alarm.
        const flagged =
          item.kind === "regression"
            ? base.flagsOnFixFiles.length > 0
            : base.flags.some(
                (f) => f.kind === "high-blast" || f.kind === "boundary",
              );

        const outcome: CaseResult["outcome"] =
          item.kind === "regression"
            ? base.attributable.length > 0 || flagged
              ? "caught"
              : ran
                ? "missed"
                : "unrunnable"
            : base.attributable.length > 0 || flagged
              ? "false-alarm"
              : ran || base.touched.length > 0
                ? "quiet"
                : "unrunnable";
        results.push({ ...base, outcome });
        console.log(
          `    → ${outcome} (${r.verdict}, ${r.testMode}, ${base.receiptMs} ms)`,
        );
      } catch (error) {
        results.push({
          ...base,
          outcome: "unrunnable",
          note:
            error instanceof Error
              ? error.message.slice(0, 300)
              : String(error),
        });
        console.log(`    → unrunnable: ${String(error).slice(0, 160)}`);
      }
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(summarise(results), null, 2)}\n`);
    }
  }
  const summary = summarise(results);
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(out.replace(/\.json$/, ".md"), renderMarkdown(summary));
  console.log(JSON.stringify(summary.totals, null, 2));
}

function summarise(results: CaseResult[]) {
  const count = (o: CaseResult["outcome"], kind?: CaseKind) =>
    results.filter((r) => r.outcome === o && (!kind || r.kind === kind)).length;
  const times = results
    .filter((r) => r.outcome !== "unrunnable")
    .map((r) => r.receiptMs)
    .sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)]! : 0;
  const regressionsRun = count("caught") + count("missed");
  const controlsRun = count("false-alarm") + count("quiet");
  return {
    generatedAt: new Date().toISOString(),
    method:
      "SZZ-lite replay. A catch is a typecheck/test failure absent on the clean parent, or a Guard/blast flag on a file the later fix touched. The same flag on a control is a false alarm.",
    totals: {
      regressions: results.filter((r) => r.kind === "regression").length,
      caught: count("caught"),
      missed: count("missed"),
      regressionsUnrunnable: count("unrunnable", "regression"),
      controls: results.filter((r) => r.kind === "control").length,
      falseAlarms: count("false-alarm"),
      quiet: count("quiet"),
      controlsUnrunnable: count("unrunnable", "control"),
      catchRate: regressionsRun ? count("caught") / regressionsRun : 0,
      falseAlarmRate: controlsRun ? count("false-alarm") / controlsRun : 0,
      flaggedRegressions: results.filter(
        (r) => r.kind === "regression" && r.flagsOnFixFiles.length > 0,
      ).length,
      medianReceiptMs: median,
    },
    cases: results,
  };
}

function renderMarkdown(summary: ReturnType<typeof summarise>): string {
  const t = summary.totals;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines = [
    "# Replay benchmark",
    "",
    `Generated ${summary.generatedAt}. Method: ${summary.method}.`,
    "",
    "| | Count |",
    "|---|---|",
    `| Regressions replayed | ${t.regressions} (${t.regressionsUnrunnable} unrunnable) |`,
    `| Caught by a check that passed before the change | **${t.caught}** |`,
    `| Missed | ${t.missed} |`,
    `| Catch rate (runnable) | ${pct(t.catchRate)} |`,
    `| Regressions with a Guard / blast flag on a file the fix touched | ${t.flaggedRegressions} |`,
    `| Controls replayed | ${t.controls} (${t.controlsUnrunnable} unrunnable) |`,
    `| False alarms (control failed a check that passed before) | **${t.falseAlarms}** |`,
    `| False-alarm rate (runnable) | ${pct(t.falseAlarmRate)} |`,
    `| Median receipt time | ${(t.medianReceiptMs / 1000).toFixed(1)} s |`,
    "",
    "## Cases",
    "",
    "| Repo | Kind | Commit | Outcome | Verdict | Tests | Why |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const c of summary.cases) {
    const why =
      c.attributable[0] ??
      c.note ??
      (c.flagsOnFixFiles.length ? `flag: ${c.flagsOnFixFiles.join(", ")}` : "");
    lines.push(
      `| ${c.repo} | ${c.kind} | \`${c.commit.slice(0, 8)}\` ${c.subject.replace(/\|/g, "/").slice(0, 60)} | ${c.outcome} | ${c.verdict} | ${c.testFiles.length} (${c.testMode}) | ${why.replace(/\|/g, "/").slice(0, 120)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

await main();
