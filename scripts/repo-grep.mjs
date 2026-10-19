/**
 * `git grep` for the lint contracts, with a fallback for a copy that is not a
 * git checkout (a release tarball, a CI cache restore). Round 4 fresh-copy QA:
 * two lint scripts called `git grep` and failed outright outside git.
 *
 * In git: the caller's own `git grep` runs unchanged (it honours .gitignore
 * exactly). Outside git: `walkRepoFiles` lists files under the root, skipping
 * `.git`, the directory and file names .gitignore spells literally
 * (`node_modules/`, `dist/`, `*.log` …) and binaries, and the caller matches
 * lines itself. Hits use git grep's `path:line:text` form either way.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  readdirSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

/** True when `root` sits inside a git work tree that git can read. */
export function inGitWorkTree(root) {
  const out = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    encoding: "utf8",
  });
  return out.status === 0 && out.stdout.trim() === "true";
}

/**
 * Simple .gitignore entries: literal names (`node_modules/`, `.DS_Store`) and
 * `*.ext` suffixes. Paths with a slash inside (`apps/website/.next/`) are kept
 * as root-relative prefixes. Negations and other globs are not needed by the
 * lint scans and are skipped.
 */
export function ignoreRules(root) {
  const rules = { names: new Set([".git"]), suffixes: [], prefixes: [] };
  const file = join(root, ".gitignore");
  if (!existsSync(file)) return rules;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;
    const bare = line.replace(/\/$/, "");
    if (/^\*\.[\w.]+$/.test(bare)) rules.suffixes.push(bare.slice(1));
    else if (bare.endsWith(".*") && !bare.includes("/"))
      rules.prefixes.push(`*${bare.slice(0, -1)}`);
    else if (/[*?[\]]/.test(bare)) continue;
    else if (bare.includes("/")) rules.prefixes.push(bare.replace(/^\//, ""));
    else rules.names.add(bare);
  }
  return rules;
}

function ignored(rel, name, rules) {
  if (rules.names.has(name)) return true;
  if (rules.suffixes.some((s) => name.endsWith(s))) return true;
  return rules.prefixes.some((p) =>
    p.startsWith("*")
      ? name.startsWith(p.slice(1))
      : rel === p || rel.startsWith(`${p}/`),
  );
}

function isBinary(path) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(8000);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).includes(0);
  } finally {
    closeSync(fd);
  }
}

/** Repo-relative (forward-slash) paths of the text files git would search. */
export function walkRepoFiles(root, rules = ignoreRules(root)) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(root, path).split(sep).join("/");
      if (ignored(rel, entry.name, rules)) continue;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && !isBinary(path)) files.push(rel);
    }
  };
  walk(root);
  return files.toSorted();
}

/** `path:line:text` for every line of `files` that `match` accepts. */
export function grepFiles(root, files, match) {
  const hits = [];
  for (const rel of files) {
    readFileSync(join(root, rel), "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (match(line)) hits.push(`${rel}:${i + 1}:${line}`);
      });
  }
  return hits;
}

/** The note a lint prints when it scans without git. */
export function noGitNote(name) {
  return `${name}: not a git checkout, so scanning the files directly (.gitignore names only)`;
}
