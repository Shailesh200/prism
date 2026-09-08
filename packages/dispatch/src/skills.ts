import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prismHome } from "./paths.js";

export type SkillStatus = "draft" | "published";

export type PrismSkill = {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly status: SkillStatus;
  readonly inherited: boolean;
};

const NAME_RE = /^[a-z][a-z0-9-]{1,62}$/;

export const INHERITED_SKILLS: readonly PrismSkill[] = [
  {
    name: "prism-safe-change",
    description:
      "Use before editing unfamiliar code: blast radius, tests, and a small change.",
    body: [
      "# prism-safe-change",
      "",
      "1. Call blast_radius on the path you will edit.",
      "2. Call test_impact for that path and run those tests after the change.",
      "3. Before delete, call safe_delete. Before rename, call rename_impact.",
      "4. Keep the diff small. Do not expand scope.",
    ].join("\n"),
    status: "published",
    inherited: true,
  },
  {
    name: "prism-review-pr",
    description:
      "Use when reviewing a diff, PR, or branch — not a raw git diff alone.",
    body: [
      "# prism-review-pr",
      "",
      "1. Call review_changes (omit paths to auto-discover).",
      "2. Lead with blast radius, test impact, and breaking-change hints it already carries.",
      "3. blast_radius anything it flags as risky.",
      "4. Never invent dependents the tools did not report.",
    ].join("\n"),
    status: "published",
    inherited: true,
  },
];

export function skillsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHome(env), "dispatch", "skills");
}

export function normalizeSkillName(value: string): string | undefined {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return NAME_RE.test(name) ? name : undefined;
}

/** Pick a Yours name when duplicating an inherited skill. */
export function nameForDuplicate(
  source: string,
  existing: readonly string[],
): string | undefined {
  const stripped = source.replace(/^prism-/i, "").trim() || source;
  const base = normalizeSkillName(stripped);
  if (!base) return undefined;
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const next = `${base}-${n}`;
    if (NAME_RE.test(next) && !taken.has(next)) return next;
  }
  return undefined;
}

function skillFile(name: string, env?: NodeJS.ProcessEnv): string {
  return join(skillsDir(env), name, "SKILL.md");
}

function parseSkill(name: string, raw: string, inherited: boolean): PrismSkill {
  let description = "";
  let status: SkillStatus = "draft";
  let body = raw;
  const fence = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fence) {
    const front = fence[1] ?? "";
    body = (fence[2] ?? "").trim();
    for (const line of front.split("\n")) {
      const match = line.match(/^(description|status)\s*:\s*(.*)$/i);
      if (!match) continue;
      const key = match[1]?.toLowerCase();
      const value = match[2]?.trim().replace(/^["']|["']$/g, "") ?? "";
      if (key === "description") description = value;
      if (key === "status" && (value === "draft" || value === "published")) {
        status = value;
      }
    }
  }
  return { name, description, body, status, inherited };
}

function serializeSkill(skill: PrismSkill): string {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    `status: ${skill.status}`,
    "---",
    "",
    skill.body.trim(),
    "",
  ].join("\n");
}

export async function listSkills(
  env: NodeJS.ProcessEnv = process.env,
): Promise<readonly PrismSkill[]> {
  const user: PrismSkill[] = [];
  try {
    const names = await readdir(skillsDir(env));
    for (const name of names) {
      if (!NAME_RE.test(name)) continue;
      try {
        const raw = await readFile(skillFile(name, env), "utf8");
        user.push(parseSkill(name, raw, false));
      } catch {
        /* skip broken files */
      }
    }
  } catch {
    /* no library yet */
  }
  user.sort((a, b) => a.name.localeCompare(b.name));
  return [...INHERITED_SKILLS, ...user];
}

export async function readSkill(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PrismSkill | undefined> {
  const id = normalizeSkillName(name);
  if (!id) return undefined;
  const inherited = INHERITED_SKILLS.find((skill) => skill.name === id);
  if (inherited) return inherited;
  try {
    const raw = await readFile(skillFile(id, env), "utf8");
    return parseSkill(id, raw, false);
  } catch {
    return undefined;
  }
}

export async function writeSkill(
  input: {
    readonly name: string;
    readonly description: string;
    readonly body: string;
    readonly status: SkillStatus;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<PrismSkill | { readonly error: string }> {
  const name = normalizeSkillName(input.name);
  if (!name) {
    return { error: "Name must be lowercase letters, numbers, and dashes." };
  }
  if (INHERITED_SKILLS.some((skill) => skill.name === name)) {
    return { error: "That name ships with Prism and cannot be overwritten." };
  }
  const skill: PrismSkill = {
    name,
    description: input.description.trim(),
    body: input.body.trim(),
    status: input.status,
    inherited: false,
  };
  const dir = join(skillsDir(env), name);
  await mkdir(dir, { recursive: true });
  await writeFile(skillFile(name, env), serializeSkill(skill), "utf8");
  return skill;
}

export async function duplicateSkill(
  sourceName: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PrismSkill | { readonly error: string }> {
  const source = await readSkill(sourceName, env);
  if (!source) return { error: "Skill not found." };
  const listed = await listSkills(env);
  const name = nameForDuplicate(
    source.name,
    listed.map((row) => row.name),
  );
  if (!name) return { error: "Could not pick a name for the copy." };
  return writeSkill(
    {
      name,
      description: source.description,
      body: source.body,
      status: "draft",
    },
    env,
  );
}

export async function deleteSkill(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const id = normalizeSkillName(name);
  if (!id || INHERITED_SKILLS.some((skill) => skill.name === id)) return false;
  try {
    await rm(join(skillsDir(env), id), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export function skillSpeak(skill: PrismSkill): string {
  const when = skill.description.trim();
  return [when ? `${skill.name} — ${when}` : skill.name, skill.body.trim()]
    .filter(Boolean)
    .join("\n\n");
}
