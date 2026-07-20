#!/usr/bin/env bun
/**
 * Ensures plans/PROGRESS.md is consistent with Hard Rules.
 * - File exists
 * - At most one milestone is "In Progress"
 * - On a milestone/* branch, the In Progress row matches the branch
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const progressPath = resolve(root, "plans/PROGRESS.md");

function fail(msg) {
  console.error(`check-plan-progress: ${msg}`);
  process.exit(1);
}

if (!existsSync(progressPath)) {
  fail("plans/PROGRESS.md is missing");
}

const text = readFileSync(progressPath, "utf8");
const rowRe =
  /^\|\s*([^|]+?)\s*\|\s*`?(milestone\/[^`|\s]+|—|-)?`?\s*\|\s*([^|]+?)\s*\|/gm;

const rows = [];
for (const m of text.matchAll(rowRe)) {
  const milestone = m[1].trim();
  const branch = (m[2] ?? "").trim();
  const status = m[3].trim();
  if (milestone === "Milestone" || milestone.startsWith("---")) continue;
  rows.push({ milestone, branch, status });
}

if (rows.length === 0) {
  fail("no milestone rows parsed from PROGRESS.md");
}

const inProgress = rows.filter((r) => /in progress/i.test(r.status));
if (inProgress.length > 1) {
  fail(
    `expected at most one In Progress milestone, found ${inProgress.length}: ${inProgress
      .map((r) => r.milestone)
      .join(", ")}`,
  );
}

let currentBranch = "";
try {
  currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: root,
    encoding: "utf8",
  }).trim();
} catch {
  // not a git repo — skip branch check
}

if (currentBranch.startsWith("milestone/")) {
  if (inProgress.length === 0) {
    fail(
      `on branch ${currentBranch} but no milestone is In Progress in PROGRESS.md`,
    );
  }
  const active = inProgress[0];
  const expected = active.branch.replace(/`/g, "");
  if (
    expected &&
    expected !== "—" &&
    expected !== "-" &&
    expected !== currentBranch
  ) {
    fail(
      `branch is ${currentBranch} but In Progress milestone "${active.milestone}" lists ${expected}`,
    );
  }
}

console.log(
  `check-plan-progress: ok (${rows.length} milestones, ${inProgress.length} in progress)`,
);
