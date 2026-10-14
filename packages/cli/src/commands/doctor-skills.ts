/**
 * `prism doctor skills` (plan §5.4): user skills that name Prism tools are
 * checked against the tools this install registers. A skill naming a tool
 * that is not registered gets a warning with the file and the fix. Prism
 * reads skills only; it never edits them.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { DEFAULT_TOOL_NAMES, OPT_IN_TOOL_NAMES } from "@repo-prism/shared";
import { prismHomeDir } from "@repo-prism/shared/prism-home";
import { loadUserConfigSync } from "@repo-prism/shared/user-config";

export type SkillFinding = {
  readonly file: string;
  readonly status: "ok" | "warn";
  readonly tools: readonly string[];
  readonly problems: readonly string[];
};

/** Where user skills live (plan §5.4). */
export function skillDirs(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const home = env.HOME ?? homedir();
  return [
    join(workspaceRoot, ".claude", "skills"),
    join(workspaceRoot, ".cursor", "skills"),
    join(home, ".claude", "skills"),
    join(home, ".cursor", "skills"),
    join(prismHomeDir(env), "skills"),
  ];
}

function skillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      const skill = join(path, "SKILL.md");
      if (existsSync(skill)) out.push(skill);
    } else if (name.endsWith(".md")) {
      out.push(path);
    }
  }
  return out;
}

const ALL_KNOWN = [...DEFAULT_TOOL_NAMES, ...OPT_IN_TOOL_NAMES] as const;

/** A snake_case word that looks like a Prism tool call, known or a near miss. */
const TOOLISH = /`([a-z]+(?:_[a-z]+)+)`|\b([a-z]+(?:_[a-z]+)+)\s*\(/g;

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = next;
    }
  }
  return row[b.length]!;
}

/**
 * Check every skill that names a Prism tool. A name is "Prism's" when it is
 * a known tool, or within two edits of one (a typo such as `blast_radus`).
 */
export function checkSkills(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): SkillFinding[] {
  const config = loadUserConfigSync(env);
  const extra = new Set(config.ok ? (config.value.extraTools ?? []) : []);
  const registered = new Set<string>([
    ...DEFAULT_TOOL_NAMES,
    ...OPT_IN_TOOL_NAMES.filter((name) => extra.has(name)),
  ]);
  const findings: SkillFinding[] = [];
  for (const dir of skillDirs(workspaceRoot, env)) {
    for (const file of skillFiles(dir)) {
      const text = readFileSync(file, "utf8");
      const named = new Set<string>();
      for (const match of text.matchAll(TOOLISH)) {
        const word = match[1] ?? match[2];
        if (!word) continue;
        if (
          ALL_KNOWN.some((tool) => tool === word || distance(tool, word) <= 2)
        ) {
          named.add(word);
        }
      }
      if (named.size === 0) continue;
      const problems: string[] = [];
      for (const word of named) {
        if (registered.has(word)) continue;
        if ((OPT_IN_TOOL_NAMES as readonly string[]).includes(word)) {
          problems.push(
            `${word} is opt-in: add "${word}" to extraTools in ${join(prismHomeDir(env), "config.json")}`,
          );
        } else {
          const near = ALL_KNOWN.find((tool) => distance(tool, word) <= 2);
          problems.push(
            `unknown tool ${word}${near ? ` (did you mean ${near}?)` : ""}`,
          );
        }
      }
      findings.push({
        file: file.startsWith(workspaceRoot)
          ? relative(workspaceRoot, file)
          : file,
        status: problems.length === 0 ? "ok" : "warn",
        tools: [...named].sort(),
        problems,
      });
    }
  }
  return findings;
}
