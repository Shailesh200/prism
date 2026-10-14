#!/usr/bin/env node
/**
 * Deleted-names contract (plan §10 P1). Every name in deleted-names.json was
 * removed in 2.0; none may appear again outside the changelogs, the plans and
 * the list itself. Matches are whole words (git grep -w -F), tracked and
 * untracked files, ignoring .gitignore'd ones.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const { names } = JSON.parse(
  readFileSync(join(root, "scripts/deleted-names.json"), "utf8"),
);
export const EXCLUDE = [
  ":(exclude,glob)**/CHANGELOG*",
  ":(exclude)plans",
  // Dated release notes are history, like the changelogs.
  ":(exclude)apps/website/content/posts",
  ":(exclude)scripts/deleted-names.json",
  ":(exclude)scripts/check-deleted-names.mjs",
  ":(exclude)bun.lock",
];

const args = ["grep", "-n", "-I", "-w", "-F", "--untracked"];
for (const name of names) args.push("-e", name);
args.push("--", ".", ...EXCLUDE);
const out = spawnSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 << 20,
});
if (out.status === 1) {
  console.log(`deleted-names: clean (${names.length} names)`);
  process.exit(0);
}
if (out.status !== 0) {
  console.error(out.stderr);
  process.exit(2);
}
process.stdout.write(out.stdout);
console.error(
  `deleted-names: ${out.stdout.trim().split("\n").length} mention(s) of names removed in 2.0`,
);
process.exit(1);
