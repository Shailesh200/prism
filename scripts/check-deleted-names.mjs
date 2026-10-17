#!/usr/bin/env node
/**
 * Deleted-names contract (plan §10 P1). Every name in deleted-names.json was
 * removed in 2.0; none may appear again outside the changelogs, the plans and
 * the list itself. Matches are whole words (git grep -w -F), tracked and
 * untracked files, ignoring .gitignore'd ones. Outside a git checkout the same
 * scan runs over the files directly (scripts/repo-grep.mjs).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  grepFiles,
  inGitWorkTree,
  noGitNote,
  walkRepoFiles,
} from "./repo-grep.mjs";

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

/** The EXCLUDE pathspecs, for the scan without git. */
export function excluded(rel) {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  return (
    base.startsWith("CHANGELOG") ||
    rel.startsWith("plans/") ||
    rel.startsWith("apps/website/content/posts/") ||
    rel === "scripts/deleted-names.json" ||
    rel === "scripts/check-deleted-names.mjs" ||
    rel === "bun.lock"
  );
}

/** git grep -w -F: a name with no word character either side. */
export function wholeWords(list) {
  const escaped = list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(
    `(?<![A-Za-z0-9_])(?:${escaped.join("|")})(?![A-Za-z0-9_])`,
  );
}

function scan() {
  if (!inGitWorkTree(root)) {
    console.error(noGitNote("deleted-names"));
    const word = wholeWords(names);
    const files = walkRepoFiles(root).filter((rel) => !excluded(rel));
    const hits = grepFiles(root, files, (line) => word.test(line));
    return {
      status: hits.length > 0 ? 0 : 1,
      stdout: hits.map((h) => `${h}\n`).join(""),
      stderr: "",
    };
  }
  const args = ["grep", "-n", "-I", "-w", "-F", "--untracked"];
  for (const name of names) args.push("-e", name);
  args.push("--", ".", ...EXCLUDE);
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
}

const out = scan();
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
