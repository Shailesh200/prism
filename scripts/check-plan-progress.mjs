#!/usr/bin/env bun
/**
 * Ensures plans/PROGRESS.md is consistent with Hard Rules.
 * - File exists
 * - At most one milestone is "In Progress"
 * - On a milestone/* branch, the In Progress row matches the branch
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const progressPath = resolve(root, "plans/PROGRESS.md");
const milestonesDir = resolve(root, "plans/milestones");

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

// A milestone whose implementation is finished but whose owner sign-off is
// still outstanding sits in "In Review". Its branch is still the active one,
// so the branch check has to recognise it (M-051).
const inReview = rows.filter((r) => /in review/i.test(r.status));

if (currentBranch.startsWith("milestone/")) {
  const active =
    inProgress.find((r) => r.branch.replace(/`/g, "") === currentBranch) ??
    inReview.find((r) => r.branch.replace(/`/g, "") === currentBranch) ??
    inProgress[0];
  if (!active) {
    fail(
      `on branch ${currentBranch} but no milestone is In Progress or In Review in PROGRESS.md`,
    );
  }
  const expected = active.branch.replace(/`/g, "");
  if (
    expected &&
    expected !== "—" &&
    expected !== "-" &&
    expected !== currentBranch
  ) {
    fail(
      `branch is ${currentBranch} but active milestone "${active.milestone}" lists ${expected}`,
    );
  }
}

/**
 * A milestone marked Verified with unchecked DoD boxes is the plan lying about
 * itself: the table says done, the doc says otherwise. Fail loudly so the two
 * cannot drift (M-051 Phase 4).
 */
const milestoneDocs = existsSync(milestonesDir)
  ? readdirSync(milestonesDir).filter((f) => f.endsWith(".md"))
  : [];

const dodViolations = [];
for (const row of rows) {
  if (!/^verified$/i.test(row.status)) continue;
  const id = /^(M-\d{3})\b/.exec(row.milestone)?.[1];
  if (!id) continue;
  const doc = milestoneDocs.find((f) => f.startsWith(`${id}_`));
  if (!doc) continue;

  const docText = readFileSync(resolve(milestonesDir, doc), "utf8");
  const unchecked = docText
    .split("\n")
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter(({ line }) => /^[-*]\s+\[ \]/.test(line));
  if (unchecked.length > 0) {
    dodViolations.push({ id, doc, unchecked });
  }
}

if (dodViolations.length > 0) {
  const detail = dodViolations
    .map(
      ({ id, doc, unchecked }) =>
        `\n  ${id} (${doc}): ${unchecked.length} unchecked\n${unchecked
          .map(({ line, no }) => `    L${no}: ${line}`)
          .join("\n")}`,
    )
    .join("");
  fail(
    `${dodViolations.length} milestone(s) marked Verified with unchecked DoD boxes.` +
      ` Either check the box or correct the status.${detail}`,
  );
}

console.log(
  `check-plan-progress: ok (${rows.length} milestones, ${inProgress.length} in progress, ` +
    `${milestoneDocs.length} docs, DoD clean)`,
);
