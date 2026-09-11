import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
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

export type SkillVersion = {
  readonly id: string;
  readonly createdAt: string;
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly status: SkillStatus;
  readonly current: boolean;
};

const NAME_RE = /^[a-z][a-z0-9-]{1,62}$/;
const VERSION_ID_RE = /^v[a-z0-9-]+$/i;
const MAX_SKILL_VERSIONS = 40;
export const CURRENT_SKILL_VERSION = "current";

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

function versionsDir(name: string, env?: NodeJS.ProcessEnv): string {
  return join(skillsDir(env), name, "versions");
}

function versionFile(
  name: string,
  id: string,
  env?: NodeJS.ProcessEnv,
): string {
  return join(versionsDir(name, env), `${id}.md`);
}

export function skillVersionId(at: Date = new Date()): string {
  return `v${at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
    .toLowerCase()}`;
}

function parseFrontmatter(raw: string): {
  readonly fields: Readonly<Record<string, string>>;
  readonly body: string;
} {
  const fence = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fence) return { fields: {}, body: raw };
  const fields: Record<string, string> = {};
  for (const line of (fence[1] ?? "").split("\n")) {
    const match = line.match(/^([a-zA-Z]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1]?.toLowerCase();
    if (!key) continue;
    fields[key] = match[2]?.trim().replace(/^["']|["']$/g, "") ?? "";
  }
  return { fields, body: (fence[2] ?? "").trim() };
}

export function parseSkill(
  name: string,
  raw: string,
  inherited: boolean,
): PrismSkill {
  const parsed = parseFrontmatter(raw);
  const status = parsed.fields.status;
  return {
    name,
    description: parsed.fields.description ?? "",
    body: parsed.body,
    status: status === "published" || status === "draft" ? status : "draft",
    inherited,
  };
}

function serializeSkill(
  skill: Pick<PrismSkill, "name" | "description" | "body" | "status">,
  extra?: { readonly createdAt?: string },
): string {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    `status: ${skill.status}`,
    ...(extra?.createdAt ? [`createdAt: ${extra.createdAt}`] : []),
    "---",
    "",
    skill.body.trim(),
    "",
  ].join("\n");
}

function skillContentKey(
  skill: Pick<PrismSkill, "description" | "body" | "status">,
): string {
  return JSON.stringify({
    description: skill.description,
    body: skill.body,
    status: skill.status,
  });
}

export function parseSkillVersion(
  name: string,
  id: string,
  raw: string,
): SkillVersion {
  const parsed = parseSkill(name, raw, false);
  const createdAt = parseFrontmatter(raw).fields.createdat ?? "";
  return {
    id,
    createdAt: createdAt || new Date(0).toISOString(),
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    status: parsed.status,
    current: false,
  };
}

function asCurrentVersion(skill: PrismSkill): SkillVersion {
  return {
    id: CURRENT_SKILL_VERSION,
    createdAt: "",
    name: skill.name,
    description: skill.description,
    body: skill.body,
    status: skill.status,
    current: true,
  };
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

async function copySkillVersions(
  from: string,
  to: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (from === to) return;
  try {
    const names = await readdir(versionsDir(from, env));
    await mkdir(versionsDir(to, env), { recursive: true });
    for (const file of names) {
      if (!file.endsWith(".md")) continue;
      await copyFile(
        join(versionsDir(from, env), file),
        join(versionsDir(to, env), file),
      );
    }
  } catch {
    /* no prior versions */
  }
}

async function snapshotSkillVersion(
  skill: PrismSkill,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (skill.inherited) return;
  const createdAt = new Date().toISOString();
  let id = skillVersionId(new Date(createdAt));
  await mkdir(versionsDir(skill.name, env), { recursive: true });
  try {
    await readFile(versionFile(skill.name, id, env), "utf8");
    id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
  } catch {
    /* unique */
  }
  await writeFile(
    versionFile(skill.name, id, env),
    serializeSkill(skill, { createdAt }),
    "utf8",
  );
  const listed = await listHistoricSkillVersions(skill.name, env);
  const extra = listed.slice(MAX_SKILL_VERSIONS);
  await Promise.all(
    extra.map((row) =>
      rm(versionFile(skill.name, row.id, env), { force: true }),
    ),
  );
}

async function listHistoricSkillVersions(
  name: string,
  env: NodeJS.ProcessEnv,
): Promise<SkillVersion[]> {
  const id = normalizeSkillName(name);
  if (!id) return [];
  try {
    const names = await readdir(versionsDir(id, env));
    const rows: SkillVersion[] = [];
    for (const file of names) {
      if (!file.endsWith(".md")) continue;
      const versionId = file.replace(/\.md$/i, "");
      if (!VERSION_ID_RE.test(versionId)) continue;
      try {
        const raw = await readFile(versionFile(id, versionId, env), "utf8");
        rows.push(parseSkillVersion(id, versionId, raw));
      } catch {
        /* skip broken snapshots */
      }
    }
    rows.sort((a, b) => {
      const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (Number.isFinite(byTime) && byTime !== 0) return byTime;
      return b.id.localeCompare(a.id);
    });
    return rows;
  } catch {
    return [];
  }
}

export async function listSkillVersions(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<readonly SkillVersion[] | { readonly error: string }> {
  const skill = await readSkill(name, env);
  if (!skill) return { error: "Skill not found." };
  if (skill.inherited) return { error: "Inherited skills have no history." };
  const historic = await listHistoricSkillVersions(skill.name, env);
  return [asCurrentVersion(skill), ...historic];
}

export async function readSkillVersion(
  name: string,
  versionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SkillVersion | { readonly error: string }> {
  const skill = await readSkill(name, env);
  if (!skill) return { error: "Skill not found." };
  if (skill.inherited) return { error: "Inherited skills have no history." };
  if (versionId === CURRENT_SKILL_VERSION) return asCurrentVersion(skill);
  const id = normalizeSkillName(name);
  if (!id || !VERSION_ID_RE.test(versionId)) {
    return { error: "Version not found." };
  }
  try {
    const raw = await readFile(versionFile(id, versionId, env), "utf8");
    return parseSkillVersion(id, versionId, raw);
  } catch {
    return { error: "Version not found." };
  }
}

export async function revertSkillVersion(
  name: string,
  versionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PrismSkill | { readonly error: string }> {
  const version = await readSkillVersion(name, versionId, env);
  if ("error" in version) return version;
  if (version.current) return { error: "That is already the current skill." };
  return writeSkill(
    {
      name: version.name,
      description: version.description,
      body: version.body,
      status: version.status,
    },
    env,
  );
}

export async function deleteSkillVersion(
  name: string,
  versionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ readonly ok: boolean; readonly detail: string }> {
  const skill = await readSkill(name, env);
  if (!skill || skill.inherited) {
    return { ok: false, detail: "Could not delete that version." };
  }
  if (versionId === CURRENT_SKILL_VERSION) {
    return { ok: false, detail: "The current skill cannot be deleted." };
  }
  const id = normalizeSkillName(name);
  if (!id || !VERSION_ID_RE.test(versionId)) {
    return { ok: false, detail: "Version not found." };
  }
  try {
    await rm(versionFile(id, versionId, env), { force: false });
    return { ok: true, detail: "Deleted." };
  } catch {
    return { ok: false, detail: "Version not found." };
  }
}

export async function writeSkill(
  input: {
    readonly name: string;
    readonly description: string;
    readonly body: string;
    readonly status: SkillStatus;
    readonly previousName?: string;
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
  const previous = input.previousName
    ? normalizeSkillName(input.previousName)
    : undefined;
  const prior = previous
    ? await readSkill(previous, env)
    : await readSkill(name, env);
  const skill: PrismSkill = {
    name,
    description: input.description.trim(),
    body: input.body.trim(),
    status: input.status,
    inherited: false,
  };
  await mkdir(join(skillsDir(env), name), { recursive: true });
  if (previous && previous !== name) {
    await copySkillVersions(previous, name, env);
  }
  if (
    prior &&
    !prior.inherited &&
    skillContentKey(prior) !== skillContentKey(skill)
  ) {
    await snapshotSkillVersion(
      previous && previous !== name ? { ...prior, name } : prior,
      env,
    );
  }
  await writeFile(skillFile(name, env), serializeSkill(skill), "utf8");
  if (previous && previous !== name) {
    await deleteSkill(previous, env);
  }
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

/** Title Prism uses for generate-skill jobs: `Skill: commitpush`. */
export function skillNameFromJobTitle(
  title: string | undefined,
): string | undefined {
  const match = title?.trim().match(/^skill:\s*([a-z][a-z0-9-]{0,62})/i);
  return match?.[1] ? normalizeSkillName(match[1]) : undefined;
}

/** Pull a SKILL.md out of a last message that may wrap it in a fence. */
export function unwrapSkillMarkdown(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const fences = [
    ...trimmed.matchAll(/```(?:markdown|md|skill)?\s*\r?\n([\s\S]*?)```/gi),
  ];
  if (fences.length > 0) {
    const longest = fences.reduce((best, row) =>
      (row[1]?.length ?? 0) >= (best[1]?.length ?? 0) ? row : best,
    );
    const inner = longest[1]?.trim() ?? "";
    if (inner.length >= 20) return inner;
  }
  return trimmed;
}

export type SkillDraft = {
  readonly name: string;
  readonly description: string;
  readonly body: string;
};

export function skillDraftFromMarkdown(name: string, raw: string): SkillDraft {
  const unwrapped = unwrapSkillMarkdown(raw);
  const parsed = parseSkill(name, unwrapped, false);
  if (/^---\r?\n/.test(unwrapped)) {
    return { name, description: parsed.description, body: parsed.body };
  }
  const heading = unwrapped.search(/^#{1,3}\s/m);
  const body = heading > 0 ? unwrapped.slice(heading).trim() : parsed.body;
  const when = unwrapped.match(/when to use:\s*(.+)/i);
  return {
    name,
    description: parsed.description || when?.[1]?.trim() || "",
    body,
  };
}

/**
 * Write a finished generate-skill last message into the global library.
 * Keeps the existing draft/published status. Refuses inherited names.
 */
export async function applyGeneratedSkill(input: {
  readonly title?: string;
  readonly assistant: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<PrismSkill | undefined> {
  const name = skillNameFromJobTitle(input.title);
  if (!name) return undefined;
  const draft = skillDraftFromMarkdown(name, input.assistant);
  if (!draft.body.trim()) return undefined;
  const existing = await readSkill(name, input.env);
  if (existing?.inherited) return undefined;
  const written = await writeSkill(
    {
      name,
      description: draft.description.trim() || existing?.description || "",
      body: draft.body,
      status: existing?.status ?? "draft",
    },
    input.env,
  );
  return "error" in written ? undefined : written;
}
